"use client";
import React, { useState, useEffect, useRef } from 'react';
import { storage, db } from '../lib/firebase';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import styles from './Home.module.css';

interface PhotoData { id: string; url: string; createdAt: Date | string; }

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isKakaotalk, setIsKakaotalk] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'success'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadedKeys, setUploadedKeys] = useState<Set<string>>(new Set());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [entry, setEntry] = useState({ name: '', phone: '', side: '신랑측' });

  useEffect(() => {
    // 로컬 데이터 복구 (새로고침 대비)
    const savedKeys = localStorage.getItem('my_uploaded_keys');
    const savedPhotos = localStorage.getItem('my_photo_data');
    const submitted = localStorage.getItem('event_submitted');
    
    if (savedKeys) setUploadedKeys(new Set(JSON.parse(savedKeys)));
    if (savedPhotos) setPhotos(JSON.parse(savedPhotos));
    if (submitted === 'true') setIsSubmitted(true);

    const ua = navigator.userAgent.toLowerCase();

    if (ua.includes("kakaotalk")) {
      setIsKakaotalk(true);
      if (ua.includes("android")) {
        // location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
      }
    }
  }, []);

  // [중요] 카톡 외부 브라우저 오픈 핸들러 (iOS/Android 공용 대응)
  const handleKakaotalkOut = () => {
    const url = window.location.href;
    if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
      // iOS는 이 방식이 가장 잘 먹힘
      location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    } else {
      // 안드로이드 대응
      location.href = `intent://${url.replace(/https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
    }
  };

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

        const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1080, useWebWorker: true });
        const storageRef = ref(storage, `photos/${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
        const snap = await uploadBytes(storageRef, compressed);
        const url = await getDownloadURL(snap.ref);
        
        const docData = { url, createdAt: new Date().toISOString() };
        const docRef = await addDoc(collection(db, "photos"), docData);
        
        const newPhoto = { id: docRef.id, ...docData };
        newKeys.add(key);

        // 실시간 사진 추가 및 로컬 저장
        setPhotos(prev => {
          const updated = [newPhoto, ...prev];
          localStorage.setItem('my_photo_data', JSON.stringify(updated));
          return updated;
        });
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }

      setUploadedKeys(newKeys);
      localStorage.setItem('my_uploaded_keys', JSON.stringify(Array.from(newKeys)));
      setUploadState('success');
    } catch (err) {
      console.error(err);
      setUploadState('idle');
      alert("전송 중 오류가 발생했습니다! 다시 시도해주세요. 😭");
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
        <div className={styles.kakaotalkBanner} onClick={handleKakaotalkOut} style={{ cursor: 'pointer' }}>
          <p>⚠️ 카카오톡 업로드는 불안정할 수 있습니다.<br/>원활한 이용을 위해 <strong>[외부 브라우저]</strong>로 열어주세요.</p>
        </div>
      )}

      {selectedImage && <div className={styles.imageModal} onClick={() => setSelectedImage(null)}><div className={styles.modalClose}>✕</div><img src={selectedImage} alt="enlarged" /></div>}
      
      {uploadState !== 'idle' && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {uploadState === 'processing' ? (
              <div className={styles.statusText}>
                <div className={styles.spinner} />
                  <span className={styles.loadingTitle}>사진 전송 중입니다... </span>
                  <br />
                  <span className={styles.progressCounter}>
                    ({progress.current}/{progress.total})
                  </span>                  
                  <p style={{ fontSize: '11px', color: '#ff4d4d', marginTop: '8px', fontWeight: 'normal' }}>
                    ⚠️ 전송 완료 전까지 <strong>화면을 끄거나 닫지 마세요!</strong>
                  </p>
                </div>
            ) : (
              <div className={styles.successContent}>
                <h3 style={{ marginBottom: '15px' }}>전송 완료! ❤️</h3>
                {!isSubmitted ? (
                  <div className={styles.eventBox}>
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>전송해주신 소중한 사진 감사합니다!<br/>이벤트에 응모하시겠어요?</p>
                    <input className={styles.input} placeholder="성함" onChange={e => setEntry({...entry, name: e.target.value})} />
                    <input className={styles.input} placeholder="연락처" type="tel" onChange={e => setEntry({...entry, phone: e.target.value.replace(/[^0-9]/g, '')})} />
                    <div className={styles.sideSelector}>
                      <button className={entry.side === '신랑측' ? styles.activeSide : styles.sideBtn} onClick={() => setEntry({...entry, side: '신랑측'})}>신랑측</button>
                      <button className={entry.side === '신부측' ? styles.activeSide : styles.sideBtn} onClick={() => setEntry({...entry, side: '신부측'})}>신부측</button>
                    </div>
                    <button className={styles.submitBtn} onClick={handleEventSubmit}>이벤트 응모하기</button>
                  </div>
                ) : <p style={{ margin: '20px 0', color: '#ff69b4', fontWeight: 'bold' }}>이벤트 응모까지 완료되었습니다! 감사합니다. ❤️</p>}
                <button className={styles.confirmButton} onClick={() => setUploadState('idle')}>확인</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.headerSection}><h1 className={styles.mainTitle}>세영 👩‍❤️‍👨 재민</h1></div>
      
      <label className={styles.uploadLabel} style={{ cursor: 'pointer', display: 'block' }}>
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