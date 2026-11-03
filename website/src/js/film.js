// The presentation film.
//  - Teaser: a short silent loop on the page, played only while visible and
//    only with motion allowed (otherwise its poster stays).
//  - Player: a <dialog> with custom controls (play/pause, seek bar with
//    chapter ticks, time, sound, full screen, chapters). The full film is
//    downloaded only when the player is opened. Keyboard: Space/K play,
//    ←/→ 5 s, M sound, F full screen, Escape closes.
(function () {
  const { onLangChange, t } = window.Correctly.i18n;
  const FALLBACK_DURATION = 156;
  const fmt = (s) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const motion = () => document.documentElement.classList.contains('motion');

  function initTeaser() {
    const teaser = document.querySelector('.film-teaser');
    if (!teaser || !motion()) return;
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          teaser.preload = 'auto';
          teaser.play().catch(() => {});
        } else teaser.pause();
      },
      { threshold: 0.3 },
    ).observe(teaser);
  }

  function initPlayer() {
    const dialog = document.getElementById('film');
    const video = document.getElementById('film-video');
    if (!dialog || !video || typeof dialog.showModal !== 'function') return;
    const q = (selector) => dialog.querySelector(selector);
    const frame = q('.fp');
    const toggle = q('.fp-toggle');
    const big = q('.fp-big');
    const bar = q('.fp-bar');
    const progress = q('.fp-progress');
    const buffer = q('.fp-buffer');
    const knob = q('.fp-knob');
    const now = q('.fp-now');
    const mute = q('.fp-mute');
    const full = q('.fp-full');
    const chapters = [...dialog.querySelectorAll('.fp-chapter')];
    const duration = () =>
      (Number.isFinite(video.duration) && video.duration) || FALLBACK_DURATION;

    const label = (button, key) => {
      const text = t(key);
      button.setAttribute('aria-label', text);
      button.title = text;
    };

    function sync() {
      const playing = !video.paused && !video.ended;
      dialog.classList.toggle('is-playing', playing);
      dialog.classList.toggle('is-muted', video.muted);
      label(toggle, playing ? 'film.pause' : 'film.play');
      label(big, 'film.play');
      label(mute, video.muted ? 'film.unmute' : 'film.mute');
      label(full, document.fullscreenElement ? 'film.exitFull' : 'film.full');
    }

    function time() {
      const ratio = Math.min(1, video.currentTime / duration());
      progress.style.transform = `scaleX(${ratio})`;
      knob.style.left = `${ratio * 100}%`;
      now.textContent = fmt(video.currentTime);
      bar.setAttribute('aria-valuenow', String(Math.round(video.currentTime)));
      bar.setAttribute('aria-valuetext', fmt(video.currentTime));
      let active = 0;
      chapters.forEach((chapter, index) => {
        if (video.currentTime >= Number(chapter.dataset.chapter) - 0.05)
          active = index;
      });
      chapters.forEach((chapter, index) => {
        if (index === active) chapter.setAttribute('aria-current', 'true');
        else chapter.removeAttribute('aria-current');
      });
    }

    function buffered() {
      const ranges = video.buffered;
      if (ranges.length)
        buffer.style.transform = `scaleX(${Math.min(1, ranges.end(ranges.length - 1) / duration())})`;
    }

    const play = () => video.play().catch(() => {});
    const togglePlay = () =>
      video.paused || video.ended ? play() : video.pause();
    const seek = (seconds) => {
      video.currentTime = Math.min(Math.max(0, seconds), duration() - 0.1);
      time();
    };

    function open(at) {
      if (!dialog.open) dialog.showModal();
      video.preload = 'auto';
      if (video.readyState >= 1) seek(at);
      else
        video.addEventListener('loadedmetadata', () => seek(at), {
          once: true,
        });
      play();
    }

    function close() {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      dialog.close();
    }

    const toggleFull = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else frame.requestFullscreen?.().catch(() => {});
    };

    // Openers on the page: the big button, the hero link, the chapter chips.
    for (const opener of document.querySelectorAll(
      '[data-film-open], .film-chip',
    )) {
      opener.addEventListener('click', (event) => {
        event.preventDefault();
        open(Number(opener.dataset.filmOpen ?? opener.dataset.chapter));
      });
    }
    for (const chapter of chapters)
      chapter.addEventListener('click', () => {
        seek(Number(chapter.dataset.chapter));
        play();
      });

    toggle.addEventListener('click', togglePlay);
    big.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);
    mute.addEventListener('click', () => (video.muted = !video.muted));
    full.addEventListener('click', toggleFull);
    q('.fp-close').addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(); // click on the backdrop
    });
    dialog.addEventListener('close', () => video.pause());
    for (const type of ['play', 'pause', 'ended', 'volumechange'])
      video.addEventListener(type, sync);
    video.addEventListener('timeupdate', time);
    video.addEventListener('progress', buffered);
    document.addEventListener('fullscreenchange', sync);

    // Seek bar: pointer drag and keyboard.
    const seekAt = (clientX) => {
      const box = bar.getBoundingClientRect();
      seek(((clientX - box.left) / box.width) * duration());
    };
    bar.addEventListener('pointerdown', (event) => {
      bar.setPointerCapture(event.pointerId);
      bar.classList.add('is-dragging');
      seekAt(event.clientX);
    });
    bar.addEventListener('pointermove', (event) => {
      if (bar.classList.contains('is-dragging')) seekAt(event.clientX);
    });
    const stopDrag = () => bar.classList.remove('is-dragging');
    bar.addEventListener('pointerup', stopDrag);
    bar.addEventListener('pointercancel', stopDrag);

    dialog.addEventListener('keydown', (event) => {
      const onButton = event.target.closest('button');
      const key = event.key.toLowerCase();
      if ((key === ' ' || key === 'k') && !onButton) {
        event.preventDefault();
        togglePlay();
      } else if (key === 'arrowleft' || key === 'arrowright') {
        event.preventDefault();
        seek(video.currentTime + (key === 'arrowright' ? 5 : -5));
      } else if (key === 'home' && event.target === bar) seek(0);
      else if (key === 'end' && event.target === bar) seek(duration());
      else if (key === 'm') video.muted = !video.muted;
      else if (key === 'f') toggleFull();
    });

    onLangChange(sync);
    sync();
    time();
  }

  (window.Correctly ||= {}).film = {
    initFilm() {
      initTeaser();
      initPlayer();
    },
  };
})();
