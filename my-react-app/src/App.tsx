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
  
  // These refs hold the data for the lip sync logic
  const analyserRef = useRef<THREE.AudioAnalyser | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);

  const [ready, setReady] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);

  useEffect(() => {
    if (!mountRef.current || mountRef.current.children.length > 0) return;

    /* ================= SCENE SETUP ================= */
    const scene = new THREE.Scene();
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
    analyserRef.current = new THREE.AudioAnalyser(sound, 32);

    /* ================= LOAD MODEL ================= */
    const loader = new GLTFLoader();
    loader.load("/model.glb", (gltf) => {
      const model = gltf.scene;
      modelRef.current = model; // Store model for the lip sync loop
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
        const clip = gltf.animations[0];
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
      
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      // SAFE LIP SYNC: Only runs if model and audio are confirmed active
      if (soundRef.current?.isPlaying && analyserRef.current && modelRef.current) {
        const volume = analyserRef.current.getAverageFrequency() / 140; 
        
        // Traverse only once per frame to find morph targets
        modelRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetInfluences) {
            const mesh = child as THREE.Mesh;
            mesh.morphTargetInfluences!.forEach((influence, i) => {
              // Only amplify the mouth shapes that Rhubarb is already moving
              if (influence > 0.01) {
                mesh.morphTargetInfluences![i] = influence * (0.5 + volume);
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
      actionRef.current!.setEffectiveTimeScale(animDuration / buffer.duration);
      setAudioLoaded(true);
      URL.revokeObjectURL(url);
    });
  };

  const handleSpeak = async () => {
    if (!actionRef.current || !soundRef.current || !listenerRef.current) return;
    if (listenerRef.current.context.state === 'suspended') await listenerRef.current.context.resume();

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
        background: "rgba(0,0,0,0.8)", padding: "20px", borderRadius: "15px"
      }}>
        {!ready && <p style={{ color: "#fff" }}>Loading Model...</p>}
        {ready && (
          <>
            <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ color: "#fff" }} />
            <button
              onClick={handleSpeak}
              disabled={!audioLoaded}
              style={{
                padding: "12px 40px", fontSize: "18px", fontWeight: "bold",
                borderRadius: "8px", border: "none", cursor: audioLoaded ? "pointer" : "not-allowed",
                background: audioLoaded ? "#2563eb" : "#444", color: "#fff"
              }}
            >
              {audioLoaded ? "▶ SPEAK & SYNC" : "SELECT AUDIO"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}