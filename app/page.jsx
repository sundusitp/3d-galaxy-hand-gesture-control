"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
// ใช้ dynamic import เพื่อป้องกัน error ตอนรันฝั่ง Server (Next.js)
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// โหลด Three.js Components แบบ Dynamic
const Canvas = dynamic(() => import('@react-three/fiber').then((mod) => mod.Canvas), { ssr: false });
const Stars = dynamic(() => import('@react-three/drei').then((mod) => mod.Stars), { ssr: false });
const OrbitControls = dynamic(() => import('@react-three/drei').then((mod) => mod.OrbitControls), { ssr: false });

/**
 * ตั้งค่า Galaxy
 */
const GALAXY_CONFIG = {
  count: 8000,
  size: 0.015,
  radius: 5,
  branches: 3,
  spin: 1,
  randomness: 0.2,
  randomnessPower: 3,
  insideColor: '#ff6030',
  outsideColor: '#1b3984',
};

/**
 * ส่วนสร้าง Galaxy
 */
const Galaxy = () => {
  const points = useRef();
  
  // ใช้ useFrame จาก module โดยตรงเมื่ออยู่ภายใน Canvas
  const { useFrame } = require('@react-three/fiber');

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(GALAXY_CONFIG.count * 3);
    const colors = new Float32Array(GALAXY_CONFIG.count * 3);

    const colorInside = new THREE.Color(GALAXY_CONFIG.insideColor);
    const colorOutside = new THREE.Color(GALAXY_CONFIG.outsideColor);

    for (let i = 0; i < GALAXY_CONFIG.count; i++) {
      const i3 = i * 3;
      const radius = Math.random() * GALAXY_CONFIG.radius;
      const spinAngle = radius * GALAXY_CONFIG.spin;
      const branchAngle = ((i % GALAXY_CONFIG.branches) / GALAXY_CONFIG.branches) * Math.PI * 2;

      const randomX = Math.pow(Math.random(), GALAXY_CONFIG.randomnessPower) * (Math.random() < 0.5 ? 1 : -1);
      const randomY = Math.pow(Math.random(), GALAXY_CONFIG.randomnessPower) * (Math.random() < 0.5 ? 1 : -1);
      const randomZ = Math.pow(Math.random(), GALAXY_CONFIG.randomnessPower) * (Math.random() < 0.5 ? 1 : -1);

      positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
      positions[i3 + 1] = randomY * 0.5;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

      const mixedColor = colorInside.clone();
      mixedColor.lerp(colorOutside, radius / GALAXY_CONFIG.radius);

      colors[i3] = mixedColor.r;
      colors[i3 + 1] = mixedColor.g;
      colors[i3 + 2] = mixedColor.b;
    }
    return { positions, colors };
  }, []);

  useFrame((state) => {
    if (points.current) {
      points.current.rotation.y = state.clock.getElapsedTime() * 0.05;
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={GALAXY_CONFIG.size}
        sizeAttenuation={true}
        depthWrite={false}
        vertexColors={true}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

/**
 * ส่วนควบคุมด้วยมือ
 */
const HandController = ({ handData }) => {
  const { useThree, useFrame } = require('@react-three/fiber');
  const { camera } = useThree();
  const targetZoom = useRef(5);
  const targetAzimuth = useRef(0);
  const targetPolar = useRef(Math.PI / 3);

  useFrame(() => {
    if (!handData) return;

    // การหมุน (Orbit)
    const xOffset = (handData.x - 0.5) * 2;
    const yOffset = (handData.y - 0.5) * 2;

    const desiredAzimuth = xOffset * 3.0;
    const desiredPolar = (Math.PI / 2) + (yOffset * 1.5); 

    const lerpFactor = 0.05;
    targetAzimuth.current += (desiredAzimuth - targetAzimuth.current) * lerpFactor;
    targetPolar.current += (desiredPolar - targetPolar.current) * lerpFactor;

    const radius = targetZoom.current;
    const clampedPolar = Math.max(0.1, Math.min(Math.PI - 0.1, targetPolar.current));

    camera.position.x = radius * Math.sin(clampedPolar) * Math.sin(targetAzimuth.current);
    camera.position.y = radius * Math.cos(clampedPolar);
    camera.position.z = radius * Math.sin(clampedPolar) * Math.cos(targetAzimuth.current);
    camera.lookAt(0, 0, 0);

    // การซูม (Pinch)
    if (handData.landmarks) {
      const thumb = handData.landmarks[4];
      const index = handData.landmarks[8];
      const distance = Math.sqrt(
        Math.pow(thumb.x - index.x, 2) + 
        Math.pow(thumb.y - index.y, 2)
      );

      const minDist = 0.02;
      const maxDist = 0.15;
      const normalizedDist = Math.max(0, Math.min(1, (distance - minDist) / (maxDist - minDist)));
      const desiredZoom = 3 + (normalizedDist * 8);
      
      targetZoom.current += (desiredZoom - targetZoom.current) * 0.1;
    }
  });

  return null;
};

/**
 * หน้าหลัก
 */
export default function Home() {
  const videoRef = useRef(null);
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [handData, setHandData] = useState(null);
  const [status, setStatus] = useState("กำลังโหลด AI...");

  useEffect(() => {
    const initHandLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        setHandLandmarker(landmarker);
        setStatus("เปิดกล้องได้เลย");
      } catch (err) {
        console.error(err);
        setStatus("Error: โหลด AI ไม่สำเร็จ");
      }
    };
    initHandLandmarker();
  }, []);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
        setStatus("เริ่มขยับมือได้เลย!");
      }
    } catch (err) {
      console.error(err);
      setStatus("ไม่สามารถเข้าถึงกล้องได้");
    }
  };

  const predictWebcam = () => {
    if (!handLandmarker || !videoRef.current) return;

    let lastVideoTime = -1;
    const renderLoop = () => {
      if (videoRef.current && videoRef.current.currentTime !== lastVideoTime) {
        lastVideoTime = videoRef.current.currentTime;
        const startTimeMs = performance.now();
        const results = handLandmarker.detectForVideo(videoRef.current, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const centerX = (landmarks[0].x + landmarks[9].x + landmarks[5].x) / 3;
          const centerY = (landmarks[0].y + landmarks[9].y + landmarks[5].y) / 3;

          setHandData({
            x: 1 - centerX,
            y: centerY,
            landmarks: landmarks
          });
        } else {
          setHandData(null);
        }
      }
      requestAnimationFrame(renderLoop);
    };
    renderLoop();
  };

  useEffect(() => {
    if (handLandmarker && status === "เปิดกล้องได้เลย") {
      startWebcam();
    }
  }, [handLandmarker, status]);

  return (
    <div className="w-full h-screen bg-black text-white overflow-hidden relative font-sans">
      <div className="absolute inset-0 z-0">
        <Canvas 
          camera={{ position: [0, 2, 5], fov: 60 }}
          gl={{ outputColorSpace: THREE.SRGBColorSpace, alpha: false }}
        >
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1.5} />
          <Suspense fallback={null}>
             <Galaxy />
             <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          </Suspense>
          <HandController handData={handData} />
        </Canvas>
      </div>

      <div className="absolute top-4 left-4 z-10 bg-gray-900/80 p-4 rounded-xl border border-gray-700 backdrop-blur-sm max-w-xs shadow-2xl">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 mb-2">
          Galaxy Hand Control
        </h1>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${handData ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-gray-300">{status}</span>
        </div>
        <div className="space-y-2 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span className="bg-gray-800 p-1.5 rounded text-lg">✋</span>
            <span>ขยับมือเพื่อ <strong>หมุน</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-gray-800 p-1.5 rounded text-lg">👌</span>
            <span>จีบนิ้วเพื่อ <strong>ซูมเข้า</strong></span>
          </div>
          <div className="flex items-center gap-2">
             <span className="bg-gray-800 p-1.5 rounded text-lg">🖐️</span>
             <span>แบมือเพื่อ <strong>ซูมออก</strong></span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-10 w-48 rounded-lg overflow-hidden border-2 border-gray-700 shadow-xl bg-black">
        <video 
          ref={videoRef} 
          className="w-full h-full object-cover transform -scale-x-100 opacity-80" 
          autoPlay 
          playsInline 
          muted 
        />
        {!handData && status.includes('Active') && (
           <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-center p-2">
             Show hand to start
           </div>
        )}
      </div>
    </div>
  );
}