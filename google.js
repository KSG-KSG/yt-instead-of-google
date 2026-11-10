// google.com 홈 화면의 구글 로고 자리(검색창 위)에 YouTube 첫 추천 영상을 재생한다.
(() => {
  const params = new URLSearchParams(location.search);
  const isHome = (location.pathname === "/" || location.pathname === "/webhp") && !params.has("q");
  if (!isHome || params.has("stay")) return; // google.com/?stay → 원래 화면

  chrome.runtime.sendMessage({ type: "GET_VIDEOS" }, (res) => {
    if (chrome.runtime.lastError || !res?.ids?.length) return;
    mount(res.ids);
  });

  function mount(ids) {
    const form = document.querySelector("form[role='search'], form[action='/search']");
    if (!form) return;

    const box = document.createElement("div");
    box.id = "yt-first-player";
    // 화면 높이에 맞춰 크기 조절: 상단바 + 플레이어 + 검색창이 스크롤 없이 보이도록
    box.style.cssText = [
      "width:min(720px, 92vw, calc((100vh - 330px) * 16 / 9))", "aspect-ratio:16/9",
      "margin:12px auto 16px", "flex-shrink:0",
      "border-radius:12px", "overflow:hidden", "background:#000",
      "box-shadow:0 4px 24px rgba(0,0,0,.25)",
    ].join(";");

    // 구글 로고(두들 포함) 영역 = 검색창 묶음 바로 위 형제 요소
    const logoArea =
      document.getElementById("sI1XGe") ||
      form.closest(".acUsEb")?.previousElementSibling;
    if (logoArea && !logoArea.contains(form)) {
      for (const child of logoArea.children) {
        if (child.tagName !== "STYLE") child.style.setProperty("display", "none", "important");
      }
      logoArea.style.setProperty("height", "auto", "important");
      logoArea.style.setProperty("min-height", "0", "important");
      logoArea.style.setProperty("max-height", "none", "important"); // 구글 기본값 290px
      logoArea.style.setProperty("justify-content", "flex-end", "important");
      logoArea.appendChild(box);
    } else {
      form.insertAdjacentElement("beforebegin", box);
    }

    let idx = 0;
    let iframe;

    const load = () => {
      if (idx >= ids.length) return box.remove();
      iframe?.remove();
      iframe = document.createElement("iframe");
      const q = new URLSearchParams({
        autoplay: "1", mute: "1", playsinline: "1", rel: "0",
        enablejsapi: "1", origin: location.origin,
      });
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(ids[idx])}?${q}`;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.style.cssText = "width:100%;height:100%;border:0;display:block";
      // 플레이어 이벤트 수신 등록 (오류 감지용)
      iframe.addEventListener("load", () => send({ event: "listening", id: 1 }));
      box.appendChild(iframe);
    };

    const send = (obj) => iframe?.contentWindow?.postMessage(JSON.stringify(obj), "https://www.youtube.com");
    const command = (func, args = []) => send({ event: "command", func, args });

    // 임베드 불가(101/150/153) 등 오류 → 다음 후보 영상
    window.addEventListener("message", (e) => {
      if (e.origin !== "https://www.youtube.com" || e.source !== iframe?.contentWindow) return;
      let data;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (data?.event === "onError") { idx++; load(); }
    });

    // 크롬 자동재생 정책상 음소거로 시작 → 페이지에서 처음 클릭/키 입력하면 소리 켬
    const unmute = () => { command("unMute"); command("playVideo"); };
    window.addEventListener("pointerdown", unmute, { once: true, capture: true });
    window.addEventListener("keydown", unmute, { once: true, capture: true });

    load();
  }
})();
