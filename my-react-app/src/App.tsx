import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react"; 
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const soundRef = useRef<THREE.Audio | null>(null);
  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const analyserRef = useRef<THREE.AudioAnalyser | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);

  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [audioLoaded, setAudioLoaded] = useState(false);

  useEffect(() => {
    // 1. PREVENT DUPLICATES: Clean the mount point entirely
    if (mountRef.current) mountRef.current.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a); 

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // 2. STABLE RENDERER SETUP
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      preserveDrawingBuffer: true // Helps with reload stability
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current?.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(2, 5, 10);
    scene.add(light);

    const listener = new THREE.AudioListener();
    camera.add(listener);
    listenerRef.current = listener;
    const sound = new THREE.Audio(listener);
    soundRef.current = sound;
    analyserRef.current = new THREE.AudioAnalyser(sound, 32);

    /* ================= 3. CACHE-BUSTING LOAD ================= */
    const loader = new GLTFLoader();
    // Adding a timestamp ensures the browser doesn't load a "broken" cached version
    const modelPath = `/model.glb?v=${new Date().getTime()}`;
    
    loader.load(
      modelPath, 
      (gltf) => {
        const model = gltf.scene;
        modelRef.current = model;
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
          const action = mixer.clipAction(gltf.animations[0]);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          actionRef.current = action;
        }
        setReady(true);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          setProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => console.error("Critical Load Error:", err)
    );

    const clock = new THREE.Clock();
    let frameId: number;
    
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (mixerRef.current) mixerRef.current.update(clock.getDelta());

      // LIP SYNC LOGIC
      if (soundRef.current?.isPlaying && analyserRef.current && modelRef.current) {
        const volume = analyserRef.current.getAverageFrequency() / 140; 
        modelRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetInfluences) {
            const mesh = child as THREE.Mesh;
            mesh.morphTargetInfluences!.forEach((inf, i) => {
              if (inf > 0.02) mesh.morphTargetInfluences![i] = inf * (0.6 + volume);
            });
          }
        });
      }
      renderer.render(scene, camera);
    };
    animate();

    /* ================= 4. TOTAL ENGINE RESET ================= */
    return () => {
      cancelAnimationFrame(frameId);
      setReady(false);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss(); // Releases GPU memory
      }
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, []);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !soundRef.current || !actionRef.current) return;
    const url = URL.createObjectURL(file);
    new THREE.AudioLoader().load(url, (buffer) => {
      soundRef.current!.setBuffer(buffer);
      actionRef.current!.setEffectiveTimeScale(actionRef.current!.getClip().duration / buffer.duration);
      setAudioLoaded(true);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#000" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      <div style={{
        position: "fixed", bottom: "40px", left: "50%", transform: "translateX(-50%)",
        background: "rgba(20,20,20,0.95)", padding: "20px", borderRadius: "12px", 
        border: "1px solid #444", textAlign: "center", minWidth: "300px"
      }}>
        {!ready ? (
          <div>
            <p style={{ color: "#fff" }}>Reloading Engine: {progress}%</p>
            <div style={{ width: "100%", height: "6px", background: "#333", borderRadius: "3px" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "#2563eb", borderRadius: "3px" }} />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ color: "white" }} />
            <button
              onClick={async () => {
                if (listenerRef.current?.context.state === 'suspended') await listenerRef.current.context.resume();
                actionRef.current?.reset().play();
                soundRef.current?.play();
              }}
              disabled={!audioLoaded}
              style={{
                padding: "12px", background: audioLoaded ? "#2563eb" : "#444",
                color: "#fff", border: "none", borderRadius: "8px", cursor: audioLoaded ? "pointer" : "not-allowed"
              }}
            >
              {audioLoaded ? "▶ START PERFORMANCE" : "UPLOAD AUDIO"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}