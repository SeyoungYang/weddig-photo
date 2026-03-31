"use client";

import React, { useState } from 'react';
import { storage, db } from '../lib/firebase';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import styles from './Home.module.css'; // CSS 모듈 임포트

export default function Home() {
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'uploading' | 'success'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadedKeys, setUploadedKeys] = useState<Set<string>>(new Set());

  const handleFileChange_old = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setProgress({ current: 0, total: fileArray.length });
    
    try {
      setUploadState('processing');
      const compressedFiles = await Promise.all(
        fileArray.map(file =>
          imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true })
        )
      );

      setUploadState('uploading');

      const uploadTasks = compressedFiles.map(async (compressedFile) => {
        try {
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const storageRef = ref(storage, `photos/${fileName}`);
          const snapshot = await uploadBytes(storageRef, compressedFile);
          const url = await getDownloadURL(snapshot.ref);

          const docData = { url, createdAt: new Date() };
          const docRef = await addDoc(collection(db, "photos"), docData);

          setPhotos(prev => [{ id: docRef.id, ...docData }, ...prev]);
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          return docRef;
        } catch (err) {
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          return null;
        }
      });

      await Promise.all(uploadTasks);
      await new Promise(res => setTimeout(res, 800));
      setUploadState('success');
      e.target.value = "";
    } catch (error) {
      setUploadState('idle');
      alert("처리 중 오류가 발생했습니다.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileArray = Array.from(e.target.files || []);
    if (fileArray.length === 0) return;

    setUploadState('processing');
    setProgress({ current: 0, total: fileArray.length });

    // 3개씩 묶어서 처리 (Chunking)
    const chunkSize = 3; 
    for (let i = 0; i < fileArray.length; i += chunkSize) {
      const chunk = fileArray.slice(i, i + chunkSize);
      
      // 3개를 동시에 압축 및 업로드 (Promise.all 활용)
      await Promise.all(chunk.map(async (file, index) => {
        const fileKey = `${file.name}_${file.size}`;
        if (uploadedKeys.has(fileKey)) return;

        // 압축 옵션 최적화: maxSizeMB를 높여서 압축 횟수 감소
        const compressedFile = await imageCompression(file, { 
          maxSizeMB: 1.5, // 0.5에서 상향
          maxWidthOrHeight: 1080, // 1280에서 하향
          useWebWorker: true 
        });

        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const storageRef = ref(storage, `photos/${fileName}`);
        const snapshot = await uploadBytes(storageRef, compressedFile);
        const url = await getDownloadURL(snapshot.ref);

        const docData = { url, createdAt: new Date() };
        const docRef = await addDoc(collection(db, "photos"), docData);

        setPhotos(prev => [{ id: docRef.id, ...docData }, ...prev]);
        setUploadedKeys(prev => new Set(prev).add(fileKey));
      }));

      // 진행도 업데이트
      setProgress(prev => ({ 
        ...prev, 
        current: Math.min(i + chunkSize, fileArray.length) 
      }));
    }
    setUploadState('success');
  };

  return (
    <main className={styles.container}>
      {/* 2. 이미지 확대 모달 (최상단에 배치) */}
      {selectedImage && (
        <div className={styles.imageModal} onClick={() => setSelectedImage(null)}>
          <div className={styles.modalClose}>✕</div>
          <img src={selectedImage} alt="enlarged" />
        </div>
      )}
      {uploadState !== 'idle' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {uploadState === 'processing' || uploadState === 'uploading' ? (
              <>
                <div className={styles.spinnerWrapper}>
                  <div className={styles.spinner} />
                </div>
                <div className={styles.statusText}>
                  {uploadState === 'processing'
                    ? `사진 압축 중...`
                    : (
                      <>
                        업로드 중...<br />
                        ({progress.current} / {progress.total})
                      </>
                    )}
                </div>
              </>
            ) : (
              <>
                <div className={styles.successIcon}>✅</div>
                <h3 className={styles.successTitle}>전송 완료!</h3>
                <p className={styles.successDesc}>
                   감사합니다.❤️
                </p>
                <button
                  className={styles.confirmButton}
                  onClick={() => setUploadState('idle')}
                >
                  확인
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className={styles.headerSection}>
        <h1 className={styles.mainTitle}>세영 👩‍❤️‍👨 재민</h1>
        {/* <h2 className={styles.subTitle}>
          오늘의 소중한 추억을 <br /> 선물해 주세요 🎁
        </h2> */}
        <p className={styles.description}>
          하객 여러분께서 직접 담아주신 찰나의 순간들이<br />
          저희 부부에게는 가장 큰 선물이 됩니다.
        </p>
      </div>

      <label className={styles.uploadLabel}>
        📸 오늘의 추억 선물하기
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange} 
          disabled={uploadState !== 'idle'} 
          multiple 
          style={{ display: 'none' }} 
        />
      </label>

      <div style={{ marginTop: '40px', textAlign: 'left' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'baseline',
          padding: '0 4px',
          marginBottom: '10px' 
        }}>
          <h3 style={{ color: '#333', fontSize: '14px', margin: 0 ,fontWeight: 'bold'}}>공유한 사진들</h3>
          <span style={{ color: '#ff69b4', fontSize: '14px', fontWeight: 'bold' }}>
            총 {photos.length}장
          </span>
        </div>

        <div className={styles.photoGrid}>
          {photos.map(p => (
            <div 
              key={p.id} 
              className={styles.photoItem} 
              onClick={() => setSelectedImage(p.url)} // 클릭 시 이미지 URL 저장
              style={{ cursor: 'pointer' }}
            >
              <img src={p.url} alt="wedding" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}