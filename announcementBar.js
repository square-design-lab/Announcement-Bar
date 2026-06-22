/* =========================================================================
   sdlAnnouncementBar — Animated Announcement Bar for Squarespace
   Modes: marquee (infinite scroll), rotating (vertical cycle), static+countdown
   No class / no constructor — self-initialising IIFE.
   Configure via window.SDL_ANNOUNCEMENT_CONFIG (deep-merged with defaults).
   ========================================================================= */

if (!window.sdlAnnouncementBar) {
  window.sdlAnnouncementBar = (function () {
    "use strict";

    /* ── Utility helpers ─────────────────────────────────────── */
    const isObj = v =>
      v && typeof v === "object" && !Array.isArray(v) &&
      (v.constructor === Object || Object.getPrototypeOf(v) === null);

    function deepMerge(t, ...sources) {
      sources.forEach(s => {
        if (!isObj(s)) return;
        Object.keys(s).forEach(k => {
          if (isObj(s[k])) { if (!isObj(t[k])) t[k] = {}; deepMerge(t[k], s[k]); }
          else t[k] = s[k];
        });
      });
      return t;
    }

    function rgbToHex(rgb) {
      if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)") return null;
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) return null;
      return "#" + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, "0")).join("");
    }

    /* ── Defaults ────────────────────────────────────────────── */
    const DEFAULTS = {
      mode: "marquee",
      bar: {
        height: 40,
        mobileHeight: 36,
        closable: true,
        closeId: "sdl-ab-1",
        reopenAfter: 0,
        barLinkUrl: "",
        barLinkTarget: "_self"
      },
      style: {
        useTheme: true,
        bgColor: "#1a1a1a",
        textColor: "#ffffff",
        fontSource: "body",
        fontSize: 14,
        mobileFontSize: 12,
        fontWeight: 400,
        letterSpacing: 0,
        textTransform: "none"
      },
      marquee: {
        speed: 50,
        direction: "left",
        pauseOnHover: true,
        gap: 60
      },
      rotating: {
        interval: 3000,
        animation: "slideUp",
        pauseOnHover: true
      },
      countdown: {
        targetDate: "",
        expiredText: "Event has started!",
        showLabels: true,
        labelStyle: "short",
        separator: ":",
        position: "right"
      },
      texts: [{ content: "Welcome to our store!", linkUrl: "", linkTarget: "_self" }],
      icons: []
    };

    let cfg, barEl, rotateTimer, countdownTimer, currentRotateIdx = 0;

    /* ── Dismiss check ───────────────────────────────────────── */
    function isDismissed() {
      var key = "sdl-ab-closed-" + cfg.bar.closeId;
      if (cfg.bar.reopenAfter > 0) {
        var ts = localStorage.getItem(key);
        if (!ts) return false;
        var elapsed = (Date.now() - parseInt(ts, 10)) / 60000;
        if (elapsed >= cfg.bar.reopenAfter) {
          localStorage.removeItem(key);
          return false;
        }
        return true;
      }
      return !!sessionStorage.getItem(key);
    }

    function setDismissed() {
      var key = "sdl-ab-closed-" + cfg.bar.closeId;
      if (cfg.bar.reopenAfter > 0) {
        localStorage.setItem(key, String(Date.now()));
      } else {
        sessionStorage.setItem(key, "1");
      }
    }

    /* ── Theme detection ─────────────────────────────────────── */
    function detectTheme() {
      var nativeBar = document.querySelector(".sqs-announcement-bar");
      if (nativeBar) {
        var textEl = document.querySelector(".sqs-announcement-bar-text-inner") || nativeBar;
        return { bg: rgbToHex(getComputedStyle(nativeBar).backgroundColor), text: rgbToHex(getComputedStyle(textEl).color) };
      }
      var header = document.querySelector("#header");
      if (header) {
        var cs = getComputedStyle(header);
        return { bg: rgbToHex(cs.color), text: rgbToHex(cs.backgroundColor) };
      }
      return null;
    }

    function detectFont(source) {
      if (source === "heading") {
        var el = document.querySelector("h1, h2, h3, .header-title-text");
        return el ? getComputedStyle(el).fontFamily : "inherit";
      }
      var el = document.querySelector("p, .sqsrte-large, body");
      return el ? getComputedStyle(el).fontFamily : "inherit";
    }

    /* ── Build text item HTML ────────────────────────────────── */
    function buildTextItem(t) {
      var html = t.content;
      if (t.linkUrl) {
        html = '<a href="' + t.linkUrl + '" target="' + (t.linkTarget || "_self") + '" class="sdl-ab-link">' + t.content + '</a>';
      }
      return '<span class="sdl-ab-text-item">' + html + '</span>';
    }

    function buildIconItem(icon) {
      var cls = icon.rotate ? " sdl-ab-icon-rotate" : "";
      var style = 'width:' + (icon.size || 16) + 'px;height:' + (icon.size || 16) + 'px;' +
        (icon.rotate ? '--sdl-ab-rotate-speed:' + (icon.rotateSpeed || 3) + 's;' : '');
      return '<span class="sdl-ab-icon' + cls + '" style="' + style + '">' +
        '<img src="' + icon.src + '" alt="" />' +
        '</span>';
    }

    /* ── Marquee mode ────────────────────────────────────────── */
    function buildMarqueeSet() {
      var items = [];
      cfg.texts.forEach(function (t, i) {
        items.push(buildTextItem(t));
        if (cfg.icons.length > 0) {
          items.push(buildIconItem(cfg.icons[i % cfg.icons.length]));
        }
      });
      return items.join("");
    }

    function initMarquee(track) {
      var oneSet = buildMarqueeSet();
      track.innerHTML = oneSet;

      requestAnimationFrame(function () {
        var setW = track.scrollWidth;
        var viewW = track.parentElement.offsetWidth || window.innerWidth;
        var copies = Math.ceil(viewW / setW) + 1;
        if (copies < 2) copies = 2;

        var html = "";
        for (var i = 0; i < copies * 2; i++) html += oneSet;
        track.innerHTML = html;

        var halfW = setW * copies;
        var duration = halfW / cfg.marquee.speed;
        track.style.setProperty("--sdl-ab-duration", duration + "s");
        track.style.setProperty("--sdl-ab-gap", cfg.marquee.gap + "px");

        if (cfg.marquee.direction === "right") {
          track.classList.add("sdl-ab-track-right");
        }
        track.classList.add("sdl-ab-track-animate");
      });
    }

    /* ── Rotating mode ───────────────────────────────────────── */
    function initRotating(container) {
      if (cfg.texts.length < 2) return;

      var items = container.querySelectorAll(".sdl-ab-rotate-item");
      if (!items.length) return;

      items[0].classList.add("sdl-ab-rotate-active");
      container.dataset.animation = cfg.rotating.animation;
      currentRotateIdx = 0;

      function rotate() {
        var prev = items[currentRotateIdx];
        currentRotateIdx = (currentRotateIdx + 1) % items.length;
        var next = items[currentRotateIdx];

        prev.classList.remove("sdl-ab-rotate-active");
        prev.classList.add("sdl-ab-rotate-exit");

        next.classList.add("sdl-ab-rotate-active");

        setTimeout(function () { prev.classList.remove("sdl-ab-rotate-exit"); }, 500);
      }

      rotateTimer = setInterval(rotate, cfg.rotating.interval);

      if (cfg.rotating.pauseOnHover) {
        container.addEventListener("mouseenter", function () { clearInterval(rotateTimer); });
        container.addEventListener("mouseleave", function () { rotateTimer = setInterval(rotate, cfg.rotating.interval); });
      }
    }

    /* ── Countdown ───────────────────────────────────────────── */
    function initCountdown(el) {
      var target = new Date(cfg.countdown.targetDate).getTime();
      if (isNaN(target)) return;

      function pad(n) { return n < 10 ? "0" + n : "" + n; }

      function update() {
        var now = Date.now();
        var diff = target - now;

        if (diff <= 0) {
          el.innerHTML = '<span class="sdl-ab-countdown-expired">' + cfg.countdown.expiredText + '</span>';
          clearInterval(countdownTimer);
          return;
        }

        var d = Math.floor(diff / 86400000);
        var h = Math.floor((diff % 86400000) / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);

        var labels = cfg.countdown.labelStyle === "full"
          ? { d: " days", h: " hours", m: " min", s: " sec" }
          : { d: "d", h: "h", m: "m", s: "s" };

        var sep = '<span class="sdl-ab-cd-sep">' + cfg.countdown.separator + '</span>';
        var parts = [];
        parts.push('<span class="sdl-ab-cd-unit"><span class="sdl-ab-cd-num">' + pad(d) + '</span>' + (cfg.countdown.showLabels ? '<span class="sdl-ab-cd-label">' + labels.d + '</span>' : '') + '</span>');
        parts.push('<span class="sdl-ab-cd-unit"><span class="sdl-ab-cd-num">' + pad(h) + '</span>' + (cfg.countdown.showLabels ? '<span class="sdl-ab-cd-label">' + labels.h + '</span>' : '') + '</span>');
        parts.push('<span class="sdl-ab-cd-unit"><span class="sdl-ab-cd-num">' + pad(m) + '</span>' + (cfg.countdown.showLabels ? '<span class="sdl-ab-cd-label">' + labels.m + '</span>' : '') + '</span>');
        parts.push('<span class="sdl-ab-cd-unit"><span class="sdl-ab-cd-num">' + pad(s) + '</span>' + (cfg.countdown.showLabels ? '<span class="sdl-ab-cd-label">' + labels.s + '</span>' : '') + '</span>');

        el.innerHTML = parts.join(sep);
      }

      update();
      countdownTimer = setInterval(update, 1000);
    }

    /* ── Close handler ───────────────────────────────────────── */
    function closeBar() {
      if (!barEl) return;
      barEl.classList.add("sdl-ab-closing");
      setDismissed();
      setTimeout(function () {
        if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl);
      }, 300);
    }

    /* ── Build & inject ──────────────────────────────────────── */
    function buildBar() {
      barEl = document.createElement("div");
      barEl.id = "sdl-announcement-bar";
      barEl.className = "sdl-ab sdl-ab-mode-" + cfg.mode;

      var isMobile = window.innerWidth <= 767;
      var height = isMobile ? cfg.bar.mobileHeight : cfg.bar.height;
      var fontSize = isMobile ? cfg.style.mobileFontSize : cfg.style.fontSize;
      var fontFamily = detectFont(cfg.style.fontSource);

      barEl.style.setProperty("--sdl-ab-height", height + "px");
      barEl.style.setProperty("--sdl-ab-bg", cfg.style.bgColor);
      barEl.style.setProperty("--sdl-ab-color", cfg.style.textColor);
      barEl.style.setProperty("--sdl-ab-font-size", fontSize + "px");
      barEl.style.setProperty("--sdl-ab-font-weight", cfg.style.fontWeight);
      barEl.style.setProperty("--sdl-ab-font-family", fontFamily);
      barEl.style.setProperty("--sdl-ab-letter-spacing", cfg.style.letterSpacing + "px");
      barEl.style.setProperty("--sdl-ab-text-transform", cfg.style.textTransform);
      barEl.style.setProperty("--sdl-ab-mobile-height", cfg.bar.mobileHeight + "px");
      barEl.style.setProperty("--sdl-ab-mobile-font-size", cfg.style.mobileFontSize + "px");

      var inner = document.createElement("div");
      inner.className = "sdl-ab-inner";

      if (cfg.mode === "marquee") {
        var track = document.createElement("div");
        track.className = "sdl-ab-track";
        if (cfg.marquee.pauseOnHover) track.classList.add("sdl-ab-pause-hover");
        inner.appendChild(track);
        inner.classList.add("sdl-ab-marquee-wrap");

      } else if (cfg.mode === "rotating") {
        var rotateWrap = document.createElement("div");
        rotateWrap.className = "sdl-ab-rotate-wrap";

        cfg.texts.forEach(function (t) {
          var item = document.createElement("div");
          item.className = "sdl-ab-rotate-item";
          item.innerHTML = buildTextItem(t);
          rotateWrap.appendChild(item);
        });

        inner.appendChild(rotateWrap);

      } else if (cfg.mode === "static") {
        var staticWrap = document.createElement("div");
        staticWrap.className = "sdl-ab-static-wrap";

        if (cfg.texts.length > 0) {
          var textSpan = document.createElement("span");
          textSpan.className = "sdl-ab-static-text";
          textSpan.innerHTML = buildTextItem(cfg.texts[0]);
          staticWrap.appendChild(textSpan);
        }

        if (cfg.countdown.targetDate) {
          var cdEl = document.createElement("span");
          cdEl.className = "sdl-ab-countdown sdl-ab-countdown-" + cfg.countdown.position;
          staticWrap.appendChild(cdEl);
        }

        inner.appendChild(staticWrap);
      }

      if (cfg.bar.barLinkUrl) {
        var barLink = document.createElement("a");
        barLink.href = cfg.bar.barLinkUrl;
        barLink.target = cfg.bar.barLinkTarget || "_self";
        barLink.className = "sdl-ab-bar-link";
        barLink.appendChild(inner);
        barEl.appendChild(barLink);
      } else {
        barEl.appendChild(inner);
      }

      if (cfg.bar.closable) {
        var closeBtn = document.createElement("button");
        closeBtn.className = "sdl-ab-close";
        closeBtn.setAttribute("aria-label", "Close announcement");
        closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        closeBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          closeBar();
        });
        barEl.appendChild(closeBtn);
      }

      /* Inject inside #header, before .header-announcement-bar-wrapper.
         This keeps the bar within the fixed header so it doesn't overlap. */
      var header = document.querySelector("#header");
      var headerBarWrapper = header && header.querySelector(".header-announcement-bar-wrapper");
      if (headerBarWrapper) {
        header.insertBefore(barEl, headerBarWrapper);
      } else if (header) {
        header.insertBefore(barEl, header.firstChild);
      } else {
        document.body.insertBefore(barEl, document.body.firstChild);
      }

      if (cfg.mode === "marquee") {
        initMarquee(barEl.querySelector(".sdl-ab-track"));
      } else if (cfg.mode === "rotating") {
        initRotating(barEl.querySelector(".sdl-ab-rotate-wrap"));
      } else if (cfg.mode === "static" && cfg.countdown.targetDate) {
        initCountdown(barEl.querySelector(".sdl-ab-countdown"));
      }

      requestAnimationFrame(function () { barEl.classList.add("sdl-ab-visible"); });
    }

    /* ── Responsive update ───────────────────────────────────── */
    function handleResize() {
      if (!barEl) return;
      var isMobile = window.innerWidth <= 767;
      barEl.style.setProperty("--sdl-ab-height", (isMobile ? cfg.bar.mobileHeight : cfg.bar.height) + "px");
      barEl.style.setProperty("--sdl-ab-font-size", (isMobile ? cfg.style.mobileFontSize : cfg.style.fontSize) + "px");
    }

    /* ── Destroy ─────────────────────────────────────────────── */
    function destroy() {
      clearInterval(rotateTimer);
      clearInterval(countdownTimer);
      if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl);
      barEl = null;
    }

    /* ── Init ────────────────────────────────────────────────── */
    function init() {
      cfg = deepMerge({}, DEFAULTS, window.SDL_ANNOUNCEMENT_CONFIG || {});

      if (cfg.bar.closable && isDismissed()) return;

      if (cfg.style.useTheme) {
        var theme = detectTheme();
        if (theme) {
          if (theme.bg) cfg.style.bgColor = theme.bg;
          if (theme.text) cfg.style.textColor = theme.text;
        }
      }

      buildBar();
      window.addEventListener("resize", handleResize);
    }

    /* ── Auto-init ───────────────────────────────────────────── */
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }

    return { init: init, destroy: destroy };
  })();
}
