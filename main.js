import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AxesHelper(2));

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 10, 5);
scene.add(dir);

const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();

let mixer;
const clock = new THREE.Clock();

new GLTFLoader().load("model.glb", (gltf) => {
  const model = gltf.scene;
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());

  model.position.sub(center);
  camera.position.set(0, size * 0.6, size * 1.6);
  camera.lookAt(0, size * 0.4, 0);

  mixer = new THREE.AnimationMixer(model);
  if (gltf.animations.length > 0) {
    mixer.clipAction(gltf.animations[0]).play();
  }

  audioLoader.load("audio.wav", (buffer) => {
    sound.setBuffer(buffer);
    sound.setVolume(1);
  });
});

window.addEventListener("click", () => {
  if (sound.buffer && !sound.isPlaying) sound.play();
});

function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(clock.getDelta());
  renderer.render(scene, camera);
}
animate();
