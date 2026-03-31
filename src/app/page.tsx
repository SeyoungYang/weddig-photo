"use client";
import React, { useState, useEffect, useRef } from 'react';
import { storage, db } from '../lib/firebase';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import styles from './Home.module.css';

interface PhotoData { id: string; url: string; createdAt: Date; }

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
    const savedKeys = localStorage.getItem('my_uploaded_photos');
    const submitted = localStorage.getItem('event_submitted');
    if (savedKeys) setUploadedKeys(new Set(JSON.parse(savedKeys)));
    if (submitted === 'true') setIsSubmitted(true);
    if (navigator.userAgent.toLowerCase().includes("kakaotalk")) setIsKakaotalk(true);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileArray = Array.from(e.target.files || []);
    if (fileArray.length === 0) return;
    setUploadState('processing');
    setProgress({ current: 0, total: fileArray.length });
    const newKeys = new Set(uploadedKeys);
    let done = 0;

    try {
      for (let i = 0; i < fileArray.length; i += 2) { // 2개씩 병렬 처리
        const chunk = fileArray.slice(i, i + 2);
        const newPhotos: PhotoData[] = [];
        await Promise.all(chunk.map(async (file) => {
          const key = `${file.name}_${file.size}`;
          if (newKeys.has(key)) { done++; return; }
          const compressed = await imageCompression(file, { maxSizeMB: 0.6, maxWidthOrHeight: 1080, useWebWorker: true });
          const storageRef = ref(storage, `photos/${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
          const snap = await uploadBytes(storageRef, compressed);
          const url = await getDownloadURL(snap.ref);
          const docRef = await addDoc(collection(db, "photos"), { url, createdAt: new Date() });
          newPhotos.push({ id: docRef.id, url, createdAt: new Date() });
          newKeys.add(key);
          done++;
        }));
        setPhotos(prev => [...newPhotos, ...prev]);
        setProgress({ current: done, total: fileArray.length });
      }
      setUploadedKeys(newKeys);
      localStorage.setItem('my_uploaded_photos', JSON.stringify(Array.from(newKeys)));
      setUploadState('success');
    } catch (err) {
      setUploadState('idle');
      alert("전송 중 오류가 발생했습니다.");
    } finally { if (e.target) e.target.value = ""; }
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
              <div className={styles.statusText}>전송 중... ({progress.current}/{progress.total})</div>
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
      <label className={styles.uploadLabel} onClick={() => fileInputRef.current?.click()}>
        📸 오늘의 추억 선물하기
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={uploadState !== 'idle'} multiple style={{ display: 'none' }} />
      </label>
      <div style={{ marginTop: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '14px', margin: 0 }}>공유한 사진들</h3>
          <span style={{ color: '#ff69b4', fontSize: '14px', fontWeight: 'bold' }}>총 {photos.length}장</span>
        </div>
        <div className={styles.photoGrid}>
          {photos.map(p => <div key={p.id} className={styles.photoItem} onClick={() => setSelectedImage(p.url)}><img src={p.url} alt="wedding" /></div>)}
        </div>
      </div>
    </main>
  );
}