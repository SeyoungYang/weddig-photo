"use client";

import React, { useState, useEffect } from 'react';
import { storage, db } from '../lib/firebase';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import styles from './Home.module.css';

export default function Home() {
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'uploading' | 'success'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // --- 추가된 상태값 ---
  const [uploadedKeys, setUploadedKeys] = useState<Set<string>>(new Set());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [entry, setEntry] = useState({ name: '', phone: '', side: '신랑측' });

  // 초기 로드 시 LocalStorage 확인
  useEffect(() => {
    const savedKeys = localStorage.getItem('my_uploaded_photos');
    const submitted = localStorage.getItem('event_submitted');
    if (savedKeys) setUploadedKeys(new Set(JSON.parse(savedKeys)));
    if (submitted === 'true') setIsSubmitted(true);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileArray = Array.from(e.target.files || []);
    if (fileArray.length === 0) return;

    setUploadState('processing');
    setProgress({ current: 0, total: fileArray.length });

    const chunkSize = 3; // 3개씩 병렬 처리
    const newUploadedKeys = new Set(uploadedKeys);

    try {
      for (let i = 0; i < fileArray.length; i += chunkSize) {
        const chunk = fileArray.slice(i, i + chunkSize);
        
        await Promise.all(chunk.map(async (file) => {
          const fileKey = `${file.name}_${file.size}`;
          if (newUploadedKeys.has(fileKey)) return; // 중복 패스

          // 압축 옵션 최적화 (속도 개선)
          const compressedFile = await imageCompression(file, { 
            maxSizeMB: 1.0, 
            maxWidthOrHeight: 1080, 
            useWebWorker: true 
          });

          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const storageRef = ref(storage, `photos/${fileName}`);
          const snapshot = await uploadBytes(storageRef, compressedFile);
          const url = await getDownloadURL(snapshot.ref);

          const docData = { url, createdAt: new Date() };
          const docRef = await addDoc(collection(db, "photos"), docData);

          setPhotos(prev => [{ id: docRef.id, ...docData }, ...prev]);
          newUploadedKeys.add(fileKey);
        }));

        setProgress(prev => ({ 
          ...prev, 
          current: Math.min(i + chunkSize, fileArray.length) 
        }));
      }

      // 로컬스토리지 업데이트 (영구 보관)
      setUploadedKeys(newUploadedKeys);
      localStorage.setItem('my_uploaded_photos', JSON.stringify(Array.from(newUploadedKeys)));
      
      setUploadState('success');
      e.target.value = "";
    } catch (error) {
      console.error(error);
      setUploadState('idle');
      alert("처리 중 오류가 발생했습니다.");
    }
  };

  // 응모 제출 함수
  const handleEventSubmit = async () => {
    if (!entry.name || !entry.phone) return alert("성함과 연락처를 입력해주세요!");
    try {
      await addDoc(collection(db, "event_entries"), {
        ...entry,
        createdAt: new Date(),
        photoCount: uploadedKeys.size
      });
      localStorage.setItem('event_submitted', 'true');
      setIsSubmitted(true);
      alert("응모가 완료되었습니다! 감사합니다.🎁");
    } catch (e) {
      alert("응모 중 오류가 발생했습니다.");
    }
  };

  return (
    <main className={styles.container}>
      {selectedImage && (
        <div className={styles.imageModal} onClick={() => setSelectedImage(null)}>
          <div className={styles.modalClose}>✕</div>
          <img src={selectedImage} alt="enlarged" />
        </div>
      )}

      {uploadState !== 'idle' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {uploadState !== 'success' ? (
              <>
                <div className={styles.spinnerWrapper}><div className={styles.spinner} /></div>
                <div className={styles.statusText}>
                  {uploadState === 'processing' ? `사진 압축 중...` : `업로드 중... (${progress.current} / {progress.total})`}
                </div>
              </>
            ) : (
              <div className={styles.successContent}>
                <div className={styles.successIcon}>✅</div>
                <h3 className={styles.successTitle}>전송 완료!</h3>
                
                {/* 응모 폼 UI */}
                {!isSubmitted ? (
                  <div className={styles.eventBox}>
                    <p className={styles.eventText}>축하의 마음을 담아 사진을 보내주신<br/>하객분들을 위한 작은 이벤트를 준비했어요!🎁</p>
                    <input 
                      className={styles.input}
                      placeholder="성함" 
                      onChange={e => setEntry({...entry, name: e.target.value})} 
                    />
                    <input 
                      className={styles.input}
                      placeholder="연락처 (- 제외)" 
                      type="tel"
                      onChange={e => setEntry({...entry, phone: e.target.value.replace(/[^0-9]/g, '')})} 
                    />
                    <div className={styles.sideSelector}>
                      <button 
                        className={entry.side === '신랑측' ? styles.activeSide : styles.sideBtn} 
                        onClick={() => setEntry({...entry, side: '신랑측'})}
                      >신랑측</button>
                      <button 
                        className={entry.side === '신부측' ? styles.activeSide : styles.sideBtn} 
                        onClick={() => setEntry({...entry, side: '신부측'})}
                      >신부측</button>
                    </div>
                    <button className={styles.submitBtn} onClick={handleEventSubmit}>이벤트 응모하기</button>
                  </div>
                ) : (
                  <p className={styles.successDesc}>응모가 완료되었습니다. 감사합니다.❤️</p>
                )}
                
                <button className={styles.confirmButton} onClick={() => setUploadState('idle')}>닫기</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.headerSection}>
        <h1 className={styles.mainTitle}>세영 👩‍❤️‍👨 재민</h1>
        <p className={styles.description}>
          하객 여러분께서 직접 담아주신 찰나의 순간들이<br />
          저희 부부에게는 가장 큰 선물이 됩니다.
        </p>
      </div>

      <label className={styles.uploadLabel}>
        📸 오늘의 추억 선물하기
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploadState !== 'idle'} multiple style={{ display: 'none' }} />
      </label>

      <div style={{ marginTop: '40px', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px', marginBottom: '10px' }}>
          <h3 style={{ color: '#333', fontSize: '14px', margin: 0 ,fontWeight: 'bold'}}>공유한 사진들</h3>
          <span style={{ color: '#ff69b4', fontSize: '14px', fontWeight: 'bold' }}>총 {photos.length}장</span>
        </div>
        <div className={styles.photoGrid}>
          {photos.map(p => (
            <div key={p.id} className={styles.photoItem} onClick={() => setSelectedImage(p.url)} style={{ cursor: 'pointer' }}>
              <img src={p.url} alt="wedding" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}