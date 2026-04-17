"use client";
import React, { useState, useEffect, useCallback } from "react";
import { storage, db } from "../lib/firebase";
import { ref, getDownloadURL, uploadBytes } from "firebase/storage";
import { collection, addDoc } from "firebase/firestore";
import imageCompression from "browser-image-compression";

// ─── 설정 ────────────────────────────────────────────────
const CONCURRENCY = 6;

const COMPRESS_OPTIONS = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.7,
  fileType: "image/jpeg" as const,
};
// ─────────────────────────────────────────────────────────

interface PhotoData { id: string; url: string; createdAt: string; }


async function uploadSingle(
  file: File,
  onCompressed: () => void
): Promise<PhotoData> {
  const compressed = await imageCompression(file, COMPRESS_OPTIONS);
  onCompressed(); // 압축 완료 콜백
  const storageRef = ref(storage, `photos/${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const snap = await uploadBytes(storageRef, compressed);
  const url = await getDownloadURL(snap.ref);
  addDoc(collection(db, "photos"), { url, createdAt: new Date().toISOString() });
  return { id: snap.ref.name, url, createdAt: new Date().toISOString() };
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onDone: (result: T | null) => void
) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      try { onDone(await task()); }
      catch { onDone(null); }
    }
  });
  await Promise.all(workers);
}

export default function Home() {
  const [isKakaotalk, setIsKakaotalk] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0, compressing: 0 });
  const [uploadedKeys, setUploadedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("kakaotalk")) setIsKakaotalk(true);
    const saved = localStorage.getItem("my_uploaded_keys");
    if (saved) setUploadedKeys(new Set(JSON.parse(saved)));
  }, []);

  const handleKakaotalkOut = useCallback(() => {
    const url = window.location.href;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    } else {
      location.href = `intent://${url.replace(/https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
    }
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newFiles = files.filter(f => !uploadedKeys.has(`${f.name}_${f.size}_${f.lastModified}`));
    if (!newFiles.length) { alert("이미 전송한 사진이에요!"); return; }

    setUploadState("uploading");
    setProgress({ done: 0, total: newFiles.length, failed: 0, compressing: 0 });

    const newKeys = new Set(uploadedKeys);
    const tasks = newFiles.map(file => async () => {
      const result = await uploadSingle(file, () => {
        setProgress(p => ({ ...p, compressing: p.compressing + 1 }));
      });
      newKeys.add(`${file.name}_${file.size}_${file.lastModified}`);
      return result;
    });

    await runWithConcurrency(tasks, CONCURRENCY, (result) => {
      setProgress(p => ({
        ...p,
        done: p.done + 1,
        failed: result ? p.failed : p.failed + 1,
      }));
    });

    setUploadedKeys(newKeys);
    localStorage.setItem("my_uploaded_keys", JSON.stringify(Array.from(newKeys)));
    await new Promise(resolve => setTimeout(resolve, 700));
    setUploadState("done");
    if (e.target) e.target.value = "";
  }, [uploadedKeys]);

  // 전송 완료 기준 100%
  const progressPercent = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Noto+Serif+KR:wght@300;400&family=Cardo:ital@1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --cream: #faf7f2; --warm-white: #fff9f4;
          --rose: #c9796a; --rose-light: #e8a89e; --rose-pale: #f5e6e3;
          --text-dark: #2c2420; --text-mid: #7a6560; --text-light: #b8a8a4;
          --gold: #c9a96e;
        }
        html, body { background: var(--cream); min-height: 100vh; }
        .page {
          min-height: 100vh; background: var(--cream);
          font-family: 'Noto Serif KR', serif;
          color: var(--text-dark); padding-bottom: 60px;
        }
        .kakao-banner {
          background: #3b1f1a; color: #f5c9b0;
          padding: 12px 20px; text-align: center;
          font-size: 13px; line-height: 1.6; cursor: pointer;
        }
        .kakao-banner strong { color: #ffd580; }
        .header { position: relative; padding: 56px 24px 40px; text-align: center; }
        .header::before {
          content: ''; position: absolute;
          top: 0; left: 50%; transform: translateX(-50%);
          width: 1px; height: 40px;
          background: linear-gradient(to bottom, transparent, var(--rose-light));
        }
        .header-date {
          font-family: 'Cormorant Garamond', serif;
          font-size: 12px; letter-spacing: 4px;
          color: var(--gold); margin-bottom: 16px;
        }
        .header-names {
          font-family: 'Cormorant Garamond', serif;
          font-size: 36px; font-weight: 400;
          color: var(--text-dark); letter-spacing: 2px; margin-bottom: 4px;
        }
        .header-names span { color: var(--rose); font-size: 22px; vertical-align: middle; }
        .header-names-en {
          font-family: 'Cardo', serif;
          font-size: 12px; font-style: italic;
          letter-spacing: 4px; color: var(--text-light); margin-bottom: 0;
        }
        .header-divider {
          display: flex; align-items: center;
          gap: 12px; justify-content: center; margin: 20px 0;
        }
        .header-divider::before, .header-divider::after {
          content: ''; flex: 1; max-width: 60px; height: 1px;
          background: linear-gradient(to right, transparent, var(--rose-light));
        }
        .header-divider::after { background: linear-gradient(to left, transparent, var(--rose-light)); }
        .header-divider-icon { color: var(--rose-light); font-size: 14px; }
        .header-desc { font-size: 13px; color: var(--text-mid); line-height: 1.9; font-weight: 300; }
        .upload-wrap { padding: 0 24px; margin-bottom: 36px; }
        .upload-label {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 6px; width: 100%; padding: 20px;
          background: var(--warm-white);
          border: 1.5px solid var(--rose-light);
          border-radius: 2px; cursor: pointer;
          transition: background 0.2s; position: relative; overflow: hidden;
        }
        .upload-label::before {
          content: ''; position: absolute; inset: 0;
          background: var(--rose-pale); opacity: 0; transition: opacity 0.2s;
        }
        .upload-label:hover::before { opacity: 1; }
        .upload-label.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
        .upload-icon { font-size: 28px; position: relative; z-index: 1; }
        .upload-text {
          font-family: 'Noto Serif KR', serif; font-size: 15px; font-weight: 400;
          color: var(--text-dark); letter-spacing: 1px; position: relative; z-index: 1;
        }
        .upload-sub { font-size: 11px; color: var(--text-light); position: relative; z-index: 1; }

        /* 오버레이 */
        .overlay {
          position: fixed; inset: 0;
          background: rgba(44, 36, 32, 0.55);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 24px; overflow: hidden;
        }

        /* 완료 모달 페이드인 */
        .modal-card {
          background: var(--warm-white); border-radius: 2px;
          padding: 36px 28px; width: 100%; max-width: 320px; text-align: center;
          position: relative; z-index: 10;
          animation: modalIn 0.4s ease;
        }
        @keyframes modalIn {
          from { transform: scale(0.92) translateY(8px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
        .done-icon {
          font-size: 40px; margin-bottom: 12px;
          animation: heartBeat 0.6s ease 0.2s both;
        }
        @keyframes heartBeat {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .done-title {
          font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 300;
          color: var(--text-dark); margin-bottom: 8px;
          animation: fadeUp 0.5s ease 0.35s both;
        }
        .done-sub {
          font-size: 13px; color: var(--text-mid); margin-bottom: 8px; line-height: 1.7;
          animation: fadeUp 0.5s ease 0.45s both;
        }
        @keyframes fadeUp {
          from { transform: translateY(6px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }

        .modal-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px; font-weight: 300;
          color: var(--text-dark); margin-bottom: 20px; letter-spacing: 1px;
        }
        .progress-bar-wrap {
          width: 100%; height: 3px; background: var(--rose-pale);
          border-radius: 2px; overflow: hidden; margin-bottom: 12px;
        }
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(to right, var(--rose-light), var(--rose));
          border-radius: 2px; transition: width 0.25s ease;
        }
        .progress-count {
          font-family: 'Cormorant Garamond', serif;
          font-size: 28px; color: var(--rose); margin-bottom: 4px;
        }
        .progress-text { font-size: 13px; color: var(--text-mid); margin-bottom: 8px; }
        .progress-warn { font-size: 11px; color: #c97a6a; margin-top: 14px; line-height: 1.6; }
        .done-fail { font-size: 12px; color: var(--rose); margin-bottom: 16px; }
        .confirm-btn {
          width: 100%; padding: 13px;
          background: var(--rose); color: white;
          border: none; border-radius: 2px;
          font-family: 'Noto Serif KR', serif; font-size: 14px;
          cursor: pointer; letter-spacing: 1px; transition: background 0.2s;
          animation: fadeUp 0.5s ease 0.55s both;
        }
        .confirm-btn:hover { background: #b56a5c; }
        .email-guide {
          margin-top: 14px; text-align: center;
          font-size: 11px; color: var(--text-light); line-height: 1.8;
        }
        .email-link {
          display: inline-block; margin-top: 2px;
          font-family: 'Cardo', serif; font-size: 12px; font-style: italic;
          color: var(--rose); text-decoration: none; letter-spacing: 0.5px;
          border-bottom: 1px solid var(--rose-pale);
          transition: border-color 0.2s;
        }
        .email-link:hover { border-color: var(--rose); }
      `}</style>

      <div className="page">
        {isKakaotalk && (
          <div className="kakao-banner" onClick={handleKakaotalkOut}>
            ⚠️ 카카오톡 내부 브라우저에서는 사진 업로드가 불안정합니다.<br />
            탭하여 <strong>외부 브라우저</strong>로 열어주세요
          </div>
        )}

        {uploadState !== "idle" && (
          <div className="overlay">

            <div className="modal-card">
              {uploadState === "uploading" ? (
                <>
                  <div className="modal-title">사진 전송 중</div>
                  <div className="progress-count">{progressPercent}%</div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="progress-text">
                    {progress.compressing < progress.total
                      ? `압축 중... (${progress.compressing} / ${progress.total}장)`
                      : `${progress.done} / ${progress.total}장`
                    }
                  </div>
                  <div className="progress-warn">
                    ⚠️ 전송이 완료될 때까지<br />화면을 닫지 말아주세요
                  </div>
                </>
              ) : (
                <>
                  <div className="done-icon">💌</div>
                  <div className="done-title">전송 완료</div>
                  <div className="done-sub">소중한 순간을 나눠주셔서<br />감사합니다 ♥</div>
                  {progress.failed > 0 && (
                    <div className="done-fail">
                      {progress.failed}장은 전송에 실패했어요. 다시 시도해주세요.
                    </div>
                  )}
                  <button className="confirm-btn" onClick={() => setUploadState("idle")}>확인</button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="header">
          <div className="header-date">2026· 04 · 18</div>
          <div className="header-names">재민 <span>♥</span> 세영</div>
          <div className="header-names-en">Jaemin &amp; Seyoung</div>
          <div className="header-divider">
            <span className="header-divider-icon">✦</span>
          </div>
          <p className="header-desc">
            하객 여러분께서 담아주신 찰나의 순간들이<br />
            저희 부부에게 가장 큰 선물이 됩니다
          </p>
        </div>

        <div className="upload-wrap">
          <label className={`upload-label${uploadState !== "idle" ? " disabled" : ""}`}>
            <span className="upload-icon">📸</span>
            <span className="upload-text">오늘의 추억 선물하기</span>
            <span className="upload-sub">사진을 여러 장 한번에 보낼 수 있어요</span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadState !== "idle"}
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>
          <p className="email-guide">
            고화질 원본 사진은 아래 이메일로 보내주시면 감사합니다 🙏<br />
            <a href="mailto:hellotoyou07@gmail.com" className="email-link">
              hellotoyou07@gmail.com
            </a>
          </p>
        </div>
      </div>
    </>
  );
}