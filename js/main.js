(function () {
  const STORAGE_KEY = "btr-guest-lang";
  const DEFAULT_LANG = "en";
  const content = window.GUEST_CONTENT;

  let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  let observer = null;

  function t(obj) {
    return obj[currentLang] || obj.en || "";
  }

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang === "zh-Hant" ? "zh-Hant" : "en";
    render();
  }

  function domainFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return url.replace(/^https?:\/\//, "");
    }
  }

  function youtubeEmbed(video) {
    const title = t(video.title);
    const source = t(video.source);
    const origin =
      window.location.origin && window.location.origin !== "null"
        ? `&origin=${encodeURIComponent(window.location.origin)}`
        : "";
    const embedUrl = `https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1&playsinline=1${origin}`;
    const watchUrl = `https://www.youtube.com/watch?v=${video.id}`;

    return `
      <div class="video-card">
        <div class="video-frame">
          <iframe
            src="${embedUrl}"
            title="${title}"
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
        <div class="video-meta">
          <span class="video-source">${source}</span>
          <p class="video-caption">${title}</p>
          <a class="video-link" href="${watchUrl}" target="_blank" rel="noopener noreferrer">YouTube</a>
        </div>
      </div>
    `;
  }

  function linkCard(link) {
    const note = link.note ? `<span class="link-note">${t(link.note)}</span>` : "";
    return `
      <a class="link-card" href="${link.url}" target="_blank" rel="noopener noreferrer">
        <span class="link-copy">
          <span class="link-title">${t(link.title)}</span>
          <span class="link-desc">${t(link.description)}</span>
          <span class="link-url">${domainFromUrl(link.url)}</span>
          ${note}
        </span>
      </a>
    `;
  }

  function renderFormat(format) {
    if (!format) return "";

    const items = t(format.items)
      .map(
        (item, index) => `
          <div class="info-card">
            <div class="label">${String(index + 1).padStart(2, "0")}</div>
            <div class="value">${item}</div>
          </div>
        `
      )
      .join("");

    return `
      <div class="section-label">${t(format.title)}</div>
      <div class="info-grid fade-in">${items}</div>
    `;
  }

  function renderLinks(section) {
    const links = section.links || [];
    if (!links.length) return "";

    const hasNote = links.some((link) => link.note);
    const note = hasNote
      ? `<div class="note-box">${currentLang === "zh-Hant" ? "以下部分連結可能需要 VPN 才能瀏覽。" : "Some links below may require a VPN to access."}</div>`
      : "";

    return `
      <div class="resource-heading">${currentLang === "zh-Hant" ? "延伸閱讀" : "Further Reading"}</div>
      ${note}
      <div class="link-grid fade-in">${links.map(linkCard).join("")}</div>
    `;
  }

  function renderSection(section, index) {
    const paragraphs = t(section.body)
      .map((p) => `<p>${p}</p>`)
      .join("");

    const videos = (section.videos || [])
      .map(youtubeEmbed)
      .join("");

    const sectionNumber = String(index + 1).padStart(2, "0");

    return `
      <section class="topic-section" id="${section.id}">
        <div class="section-inner">
          <div class="section-label">${sectionNumber} &mdash; ${t(content.nav[section.id]) || t(section.title)}</div>
          <h2>${t(section.title)}</h2>
          <div class="section-copy">${paragraphs}</div>
          ${renderFormat(section.format)}
          ${videos ? `<div class="video-grid fade-in">${videos}</div>` : ""}
          ${renderLinks(section)}
        </div>
      </section>
    `;
  }

  function renderNav() {
    return Object.entries(content.nav)
      .map(([id, label]) => `<a href="#${id}">${t(label)}</a>`)
      .join("");
  }

  function render() {
    document.title = t(content.meta.title);

    const app = document.getElementById("app");
    app.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="#top">${t(content.hero.title)}</a>
          <div class="nav-actions">
            <nav class="site-nav" aria-label="Sections">${renderNav()}</nav>
            <div class="lang-switch" aria-label="${t(content.lang.label)}">
              <button class="lang-btn ${currentLang === "en" ? "active" : ""}" type="button" data-lang="en">EN</button>
              <button class="lang-btn ${currentLang === "zh-Hant" ? "active" : ""}" type="button" data-lang="zh-Hant">繁中</button>
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        <section class="hero">
          <canvas id="cellular-canvas" class="hero-shader" aria-hidden="true"></canvas>
          <div class="hero-inner">
            <div class="hero-title-block">
              <p class="eyebrow">${t(content.hero.eyebrow)}</p>
              <h1>${t(content.hero.title)}</h1>
              <p class="hero-subtitle">${t(content.hero.subtitle)}</p>
            </div>
            <p class="hero-lead">${t(content.hero.lead)}</p>
          </div>
        </section>

        ${content.sections.map(renderSection).join("")}
      </main>

      <footer class="site-footer">
        <p><strong>${t(content.footer.project)}</strong></p>
        <p>${t(content.footer.note)}</p>
      </footer>
    `;

    document.querySelectorAll(".lang-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        setLang(e.currentTarget.dataset.lang);
      });
    });

    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));
    window.dispatchEvent(new CustomEvent("btr:render"));
  }

  render();
})();
