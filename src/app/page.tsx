"use client";

import React, { useState, useEffect } from 'react';
import { storage, db } from '../lib/firebase'; // firebase.ts 경로 확인
import { ref, uploadBytesResumable, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);

  // 1. 사진 목록 실시간 불러오기
  useEffect(() => {
    const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPhotos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

 // 2. 사진 압축 및 업로드
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  try {
    setUploading(true);
    const fileArray = Array.from(files);

    // 1. 모든 작업을 한꺼번에 생성
    const uploadTasks = fileArray.map(async (file) => {
      try {
        // 이미지 압축
        const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1280, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);

        // 고유 파일명 생성
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${file.name}`;
        const storageRef = ref(storage, `photos/${fileName}`);

        // 업로드 후 결과 반환
        const snapshot = await uploadBytes(storageRef, compressedFile);
        const url = await getDownloadURL(snapshot.ref);

        // Firestore에 저장하고 그 결과(문서 참조값)를 받음
        const docData = {
          url,
          createdAt: new Date(),
          fileName: file.name // 원본 파일명도 저장하면 확인하기 좋습니다
        };

        const docRef = addDoc(collection(db, "photos"), docData);

        console.log("docRef에 뭐가 들었나",docRef)
        
        return docRef
      } catch (innerError) {
        console.error("개별 파일 업로드 실패:", file.name, innerError);
        return null; // 하나 실패해도 나머지는 진행
      }
    });

    // 2. 모든 업로드가 끝날 때까지 대기
    await Promise.all(uploadTasks);

    // 3. UI 복구 (이게 실행되어야 버튼이 바뀝니다)
    setUploading(false);
    alert(`${files.length}장의 사진 처리가 완료되었습니다!`);
    
    // input 값 초기화
    e.target.value = ""; 
    
  } catch (error) {
    console.error("전체 에러:", error);
    setUploading(false);
    alert("전송 과정 중 문제가 발생했습니다.");
  }
};

  return (
    <main style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fff5f7', minHeight: '100vh' }}>
      <h1 style={{ color: '#ff69b4', fontSize: '28px', marginBottom: '10px' }}>💖 Happy Wedding 💖</h1>
      <p style={{ marginBottom: '20px' }}>오늘의 소중한 순간을 공유해주세요!</p>
      
      {/* 모바일 친화적 업로드 버튼 */}
      <label style={{
        display: 'inline-block',
        padding: '16px 32px',
        backgroundColor: uploading ? '#cccccc' : '#ff69b4',
        color: '#fff',
        borderRadius: '50px',
        cursor: 'pointer',
        fontSize: '18px',
        fontWeight: 'bold',
        boxShadow: '0 4px 10px rgba(255, 105, 180, 0.3)'
      }}>
        {uploading ? "사진 전송 중..." : "📷 사진 선택하기"}
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange} 
          disabled={uploading}
          multiple
          style={{ display: 'none' }} 
        />
      </label>

      {/* 사진 갤러리 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '12px', 
        marginTop: '30px' 
      }}>
        {photos.map(photo => (
          <div key={photo.id} style={{ overflow: 'hidden', borderRadius: '12px', aspectRatio: '1/1' }}>
            <img src={photo.url} alt="wedding" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
      </div>
    </main>
  );
}