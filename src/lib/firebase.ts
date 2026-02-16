import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase 구성 정보 (하드코딩)
const firebaseConfig = {
  apiKey: "AIzaSyDBDivJ0qQKHB-JiivhvpyaYZ1F6tWHRp4",
  authDomain: "wedding-photo-68dd7.firebaseapp.com",
  projectId: "wedding-photo-68dd7",
  storageBucket: "wedding-photo-68dd7.firebasestorage.app",
  messagingSenderId: "155271495906",
  appId: "1:155271495906:web:2a03d3102a5b802b4bdebb",
  measurementId: "G-GST7G0H6DP"
};

// 앱 초기화 (중복 실행 방지)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 서비스 내보내기
export const db = getFirestore(app, "default");
export const storage = getStorage(app);
export default app;