"use client";
import React, { useState, useEffect } from 'react';
import { storage, db } from '../lib/firebase';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import styles from './Home.module.css';

interface PhotoData { id: string; url: string; createdAt: Date | string; }

export default function Home() {
  const [isKakaotalk, setIsKakaotalk] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'success'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadedKeys, setUploadedKeys] = useState<Set<string>>(new Set());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [entry, setEntry] = useState({ name: '', phone: '', side: '신랑측' });

  useEffect(() => {
    // 1. 중복 방지용 키 복구
    const savedKeys = localStorage.getItem('my_uploaded_keys');
    if (savedKeys) setUploadedKeys(new Set(JSON.parse(savedKeys)));
    
    // 2. 화면 렌더링용 사진 데이터 복구 (새로고침 방어)
    const savedPhotos = localStorage.getItem('my_photo_data');
    if (savedPhotos) setPhotos(JSON.parse(savedPhotos));

    const submitted = localStorage.getItem('event_submitted');
    if (submitted === 'true') setIsSubmitted(true);
    if (navigator.userAgent.toLowerCase().includes("kakaotalk")) setIsKakaotalk(true);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileArray = Array.from(e.target.files || []);
    if (fileArray.length === 0) return;
    
    setUploadState('processing');
    setProgress({ current: 0, total: fileArray.length });
    const newKeys = new Set(uploadedKeys);

    try {
      for (const file of fileArray) {
        const key = `${file.name}_${file.size}`;
        if (newKeys.has(key)) {
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          continue;
        }

        const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1080, useWebWorker: true });
        const storageRef = ref(storage, `photos/${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
        const snap = await uploadBytes(storageRef, compressed);
        const url = await getDownloadURL(snap.ref);
        
        const docData = { url, createdAt: new Date().toISOString() }; // 로컬스토리지 저장을 위해 ISO 문자열 변환
        const docRef = await addDoc(collection(db, "photos"), docData);
        
        const newPhoto = { id: docRef.id, ...docData };
        newKeys.add(key);

        // 상태 업데이트 및 로컬스토리지 즉시 동기화
        setPhotos(prev => {
          const updatedPhotos = [newPhoto, ...prev];
          localStorage.setItem('my_photo_data', JSON.stringify(updatedPhotos));
          return updatedPhotos;
        });
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }

      setUploadedKeys(newKeys);
      localStorage.setItem('my_uploaded_keys', JSON.stringify(Array.from(newKeys)));
      setUploadState('success');
    } catch (err) {
      console.error(err);
      setUploadState('idle');
      alert("전송 중 오류가 발생했습니다.");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const handleEventSubmit = async () => {
    if (!entry.name || !entry.phone) return alert("성함과 연락처를 입력해주세요!");
    try {
      await addDoc(collection(db, "event_entries"), { ...entry, createdAt: new Date(), photoCount: uploadedKeys.size });
      localStorage.setItem('event_submitted', 'true');
      setIsSubmitted(true);
      alert("응모 완료!🎁");
    } catch (e) { alert("오류 발생"); }
  };

  return (
    <main className={styles.container}>
      {isKakaotalk && (
        <div className={styles.kakaotalkBanner} onClick={() => window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`}>
          <p>⚠️ 카톡에선 업로드가 불안정합니다. <strong>[외부 브라우저 열기]</strong>를 눌러주세요.</p>
        </div>
      )}
      {selectedImage && <div className={styles.imageModal} onClick={() => setSelectedImage(null)}><img src={selectedImage} alt="zoom" /></div>}
      {uploadState !== 'idle' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {uploadState === 'processing' ? (
              <div className={styles.statusText}>
                <div className={styles.spinner} />
                사진 전송 중... ({progress.current}/{progress.total})
              </div>
            ) : (
              <div className={styles.successContent}>
                <h3>전송 완료!</h3>
                {!isSubmitted ? (
                  <div className={styles.eventBox}>
                    <input className={styles.input} placeholder="성함" onChange={e => setEntry({...entry, name: e.target.value})} />
                    <input className={styles.input} placeholder="연락처" type="tel" onChange={e => setEntry({...entry, phone: e.target.value.replace(/[^0-9]/g, '')})} />
                    <div className={styles.sideSelector}>
                      <button className={entry.side === '신랑측' ? styles.activeSide : styles.sideBtn} onClick={() => setEntry({...entry, side: '신랑측'})}>신랑측</button>
                      <button className={entry.side === '신부측' ? styles.activeSide : styles.sideBtn} onClick={() => setEntry({...entry, side: '신부측'})}>신부측</button>
                    </div>
                    <button className={styles.submitBtn} onClick={handleEventSubmit}>이벤트 응모</button>
                  </div>
                ) : <p>응모 완료❤️</p>}
                <button className={styles.confirmButton} onClick={() => setUploadState('idle')}>확인</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className={styles.headerSection}><h1 className={styles.mainTitle}>세영 👩‍❤️‍👨 재민</h1></div>
      
      {/* 불필요한 onClick 로직과 ref 제거 */}
      <label className={styles.uploadLabel}>
        📸 오늘의 추억 선물하기
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploadState !== 'idle'} multiple style={{ display: 'none' }} />
      </label>
      
      {/* 사진 그리드 영역 */}
      <div style={{ marginTop: '40px', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px', marginBottom: '10px' }}>
          <h3 style={{ color: '#333', fontSize: '14px', margin: 0, fontWeight: 'bold' }}>공유한 사진들</h3>
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