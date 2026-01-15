import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const soundRef = useRef<THREE.Audio | null>(null);
  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  
  // NEW: Ref for analyzing audio volume
  const analyserRef = useRef<THREE.AudioAnalyser | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);

  const [ready, setReady] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);

  useEffect(() => {
    if (!mountRef.current || mountRef.current.children.length > 0) return;

    /* ================= SCENE SETUP ================= */
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 5, 10);
    scene.add(light);

    /* ================= AUDIO SETUP ================= */
    const listener = new THREE.AudioListener();
    camera.add(listener);
    listenerRef.current = listener;

    const sound = new THREE.Audio(listener);
    soundRef.current = sound;
    
    // NEW: Initialize Analyser for Lip Sync
    analyserRef.current = new THREE.AudioAnalyser(sound, 32);

    /* ================= LOAD MODEL ================= */
    const loader = new GLTFLoader();
    loader.load("/model.glb", (gltf) => {
      const model = gltf.scene;
      modelRef.current = model; // Save reference for lip sync
      scene.add(model);

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;

      const faceY = size.y * 0.6;
      camera.position.set(0, faceY, size.z * 3.5);
      camera.lookAt(0, faceY, 0);

      if (gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        
        // Find the specific animation track for lip sync if it exists
        const clip = gltf.animations.find(a => a.name.toLowerCase().includes('sync')) || gltf.animations[0];
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        actionRef.current = action;
      }
      setReady(true);
    }, undefined, (err) => console.error("Error loading model:", err));

    /* ================= ANIMATION LOOP ================= */
    const clock = new THREE.Clock();
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      
      if (mixerRef.current) mixerRef.current.update(delta);

      // NEW: LIP SYNC LOGIC
      // We only run this if the sound is playing AND the model is loaded
      if (soundRef.current?.isPlaying && analyserRef.current && modelRef.current) {
        const volume = analyserRef.current.getAverageFrequency() / 150; // Calculate loudness

        modelRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetInfluences) {
            const mesh = child as THREE.Mesh;
            mesh.morphTargetInfluences!.forEach((influence, i) => {
              // Only modify the mouth shapes that are currently active in the animation track
              if (influence > 0.05) {
                mesh.morphTargetInfluences![i] = influence * (0.6 + volume);
              }
            });
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, []);

  /* ================= HANDLE UPLOAD ================= */
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !soundRef.current || !actionRef.current) return;

    const audioLoader = new THREE.AudioLoader();
    const url = URL.createObjectURL(file);

    audioLoader.load(url, (buffer) => {
      soundRef.current!.setBuffer(buffer);
      
      const animDuration = actionRef.current!.getClip().duration;
      const audioDuration = buffer.duration;
      actionRef.current!.setEffectiveTimeScale(animDuration / audioDuration);
      
      setAudioLoaded(true);
      URL.revokeObjectURL(url);
    });
  };

  const handleSpeak = async () => {
    if (!actionRef.current || !soundRef.current || !listenerRef.current) return;

    if (listenerRef.current.context.state === 'suspended') {
      await listenerRef.current.context.resume();
    }

    mixerRef.current?.stopAllAction();
    soundRef.current.stop(); 
    
    actionRef.current.reset().play();
    soundRef.current.play();
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#000" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      <div style={{
        position: "fixed", bottom: "40px", left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", gap: "15px", alignItems: "center",
        background: "rgba(0,0,0,0.85)", padding: "20px", borderRadius: "15px", border: "1px solid #333"
      }}>
        {!ready && <p style={{ color: "#fff" }}>Loading Model...</p>}
        
        {ready && (
          <>
            <label style={{ color: "#bbb", fontSize: "12px", textAlign: "center" }}>
              STEP 1: UPLOAD VOICE AUDIO
              <input 
                type="file" 
                accept="audio/*" 
                onChange={handleFileUpload} 
                style={{ display: "block", marginTop: "8px", color: "#fff" }}
              />
            </label>

            <button
              onClick={handleSpeak}
              disabled={!audioLoaded}
              style={{
                padding: "12px 40px", fontSize: "18px", fontWeight: "bold",
                borderRadius: "8px", border: "none", cursor: audioLoaded ? "pointer" : "not-allowed",
                background: audioLoaded ? "#2563eb" : "#444", color: "#fff", transition: "0.3s"
              }}
            >
              {audioLoaded ? "▶ SPEAK & SYNC" : "WAITING FOR AUDIO..."}
            </button>
          </>
        )}
      </div>
    </div>
  );
}