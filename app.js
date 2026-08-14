```javascript
(() => {
  'use strict';

  const C = window.CONTENT || {};
  const $ = (id) => document.getElementById(id);

  const safeArray = (value) =>
    Array.isArray(value) ? value : [];

  const escapeHTML = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  /* =====================================================
     GENERAL HELPERS
     ===================================================== */

  function wrapText(
    ctx,
    text,
    centerX,
    startY,
    maxWidth,
    lineHeight
  ) {
    const words = String(text).split(/\s+/);
    let line = '';
    let y = startY;

    for (const word of words) {
      const test = line + word + ' ';

      if (
        ctx.measureText(test).width > maxWidth &&
        line.trim()
      ) {
        ctx.fillText(
          line.trim(),
          centerX,
          y
        );

        line = word + ' ';
        y += lineHeight;
      } else {
        line = test;
      }
    }

    if (line.trim()) {
      ctx.fillText(
        line.trim(),
        centerX,
        y
      );
    }
  }

  function openModal(html) {
    const modal = $('modal');
    const content = $('modalContent');

    if (!modal || !content) return;

    content.innerHTML = html;

    modal.classList.add('open');
    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.style.overflow =
      'hidden';
  }

  function closeModal() {
    const modal = $('modal');

    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.style.overflow =
      '';
  }

  /* =====================================================
     HEART INTRO
     ===================================================== */

  function heartIntro() {
    const canvas = $('heartCanvas');

    if (!canvas) return;

    const ctx =
      canvas.getContext('2d');

    if (!ctx) return;

    let width =
      window.innerWidth;

    let height =
      window.innerHeight;

    let dpr =
      Math.min(
        window.devicePixelRatio || 1,
        2
      );

    function resizeCanvas() {
      width =
        window.innerWidth;

      height =
        window.innerHeight;

      dpr =
        Math.min(
          window.devicePixelRatio || 1,
          2
        );

      canvas.width =
        Math.floor(width * dpr);

      canvas.height =
        Math.floor(height * dpr);

      canvas.style.width =
        `${width}px`;

      canvas.style.height =
        `${height}px`;

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );
    }

    resizeCanvas();

    const points = [];

    for (
      let i = 0;
      i < 650;
      i++
    ) {
      const t =
        Math.random() *
        Math.PI *
        2;

      const x =
        16 *
        Math.pow(
          Math.sin(t),
          3
        );

      const y =
        -(
          13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)
        );

      points.push({
        x:
          x * 12 +
          width / 2 +
          (Math.random() - 0.5) * 90,

        y:
          y * 12 +
          height / 2 +
          (Math.random() - 0.5) * 90,

        angle:
          Math.random() *
          Math.PI *
          2,

        drift:
          Math.random() * 130,

        size:
          0.7 +
          Math.random() * 1.8
      });
    }

    const startedAt =
      performance.now();

    function draw(now) {
      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      const progress =
        Math.min(
          1,
          (now - startedAt) /
          5000
        );

      for (const point of points) {
        const driftX =
          Math.cos(
            point.angle +
            now * 0.0003
          ) *
          point.drift *
          (1 - progress);

        const driftY =
          Math.sin(
            point.angle +
            now * 0.00035
          ) *
          point.drift *
          (1 - progress);

        const x =
          width / 2 +
          (point.x - width / 2) *
            progress +
          driftX;

        const y =
          height / 2 +
          (point.y - height / 2) *
            progress +
          driftY;

        ctx.beginPath();

        ctx.fillStyle =
          `rgba(245,165,182,${0.12 + progress * 0.68})`;

        ctx.arc(
          x,
          y,
          point.size,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }

      if (progress < 1) {
        requestAnimationFrame(draw);
      }
    }

    requestAnimationFrame(draw);

    window.addEventListener(
      'resize',
      resizeCanvas,
      { passive: true }
    );
  }

  /* =====================================================
     MESSAGE WALL
     ===================================================== */

  function downloadNote(index) {
    const messages =
      safeArray(C.messages);

    const message =
      messages[index];

    if (!message) return;

    const canvas =
      document.createElement(
        'canvas'
      );

    const ctx =
      canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = 1200;
    canvas.height = 800;

    const gradient =
      ctx.createLinearGradient(
        0,
        0,
        canvas.width,
        canvas.height
      );

    gradient.addColorStop(
      0,
      '#fff7ed'
    );

    gradient.addColorStop(
      1,
      '#f5dfdf'
    );

    ctx.fillStyle = gradient;

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle =
      '#432a32';

    ctx.textAlign =
      'center';

    ctx.font =
      '52px Georgia';

    wrapText(
      ctx,
      message,
      600,
      280,
      900,
      70
    );

    ctx.font =
      'italic 25px Georgia';

    ctx.fillStyle =
      '#a85d69';

    ctx.fillText(
      `for ${C.name || 'Satviki'} · three months ♡`,
      600,
      680
    );

    const link =
      document.createElement('a');

    link.href =
      canvas.toDataURL('image/png');

    link.download =
      `satviki-note-${index + 1}.png`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function notes() {
    const wall =
      $('noteWall');

    if (!wall) return;

    wall.innerHTML = '';

    const messages =
      safeArray(C.messages);

    messages.forEach(
      (message, index) => {
        const note =
          document.createElement(
            'article'
          );

        note.className =
          'note';

        note.style.transform =
          `rotate(${[-2, 1, 3, -1][index % 4]}deg)`;

        note.innerHTML = `
          <p>${escapeHTML(message)}</p>
          <small>
            ♡ ${String(index + 1).padStart(2, '0')}
          </small>
        `;

        note.addEventListener(
          'click',
          () => {
            openModal(`
              <div class="secret-modal">

                <p class="eyebrow">
                  a little note for you
                </p>

                <h3>
                  ${escapeHTML(C.name || 'Satviki')} ♡
                </h3>

                <p>
                  ${escapeHTML(message)}
                </p>

                <button
                  class="button"
                  type="button"
                  id="downloadCurrentNote"
                >
                  download this note ♡
                </button>

              </div>
            `);

            $('downloadCurrentNote')
              ?.addEventListener(
                'click',
                () =>
                  downloadNote(index)
              );
          }
        );

        wall.appendChild(note);
      }
    );

    $('randomNote')
      ?.addEventListener(
        'click',
        () => {
          if (!messages.length) return;

          const index =
            Math.floor(
              Math.random() *
              messages.length
            );

          openModal(`
            <div class="secret-modal">

              <p class="eyebrow">
                picked just for you
              </p>

              <h3>
                ${escapeHTML(C.name || 'Satviki')} ♡
              </h3>

              <p>
                ${escapeHTML(messages[index])}
              </p>

              <button
                class="button"
                type="button"
                id="downloadRandomNote"
              >
                download this note ♡
              </button>

            </div>
          `);

          $('downloadRandomNote')
            ?.addEventListener(
              'click',
              () =>
                downloadNote(index)
            );
        }
      );
  }

  /* =====================================================
     OPEN WHEN JAR
     ===================================================== */

  function jar() {
    const jarPapers =
      $('jarPapers');

    const categories =
      $('jarCategories');

    const pickButton =
      $('pickNote');

    if (
      !jarPapers ||
      !categories ||
      !pickButton
    ) {
      return;
    }

    jarPapers.innerHTML = '';
    categories.innerHTML = '';

    const jarData =
      C.jar || {};

    const categoryList =
      safeArray(
        jarData.categories
      );

    let activeCategory =
      categoryList[0] || '';

    for (let i = 0; i < 8; i++) {
      const paper =
        document.createElement(
          'span'
        );

      paper.className =
        'paper';

      paper.textContent =
        '♡';

      paper.style.setProperty(
        '--x',
        `${20 + Math.random() * 160}px`
      );

      paper.style.setProperty(
        '--y',
        `${25 + Math.random() * 120}px`
      );

      paper.style.setProperty(
        '--r',
        `${-30 + Math.random() * 60}deg`
      );

      jarPapers.appendChild(paper);
    }

    categoryList.forEach(
      (category, index) => {
        const button =
          document.createElement(
            'button'
          );

        button.type =
          'button';

        button.className =
          `category${index === 0 ? ' active' : ''}`;

        button.textContent =
          category;

        button.addEventListener(
          'click',
          () => {
            activeCategory =
              category;

            categories
              .querySelectorAll(
                '.category'
              )
              .forEach(
                (item) =>
                  item.classList.remove(
                    'active'
                  )
              );

            button.classList.add(
              'active'
            );
          }
        );

        categories.appendChild(
          button
        );
      }
    );

    pickButton.addEventListener(
      'click',
      () => {
        const notesForCategory =
          jarData.notes?.[
            activeCategory
          ] || [];

        if (
          !notesForCategory.length
        ) {
          openModal(`
            <div class="secret-modal">
              <p>
                There isn't a note here yet ♡
              </p>
            </div>
          `);

          return;
        }

        const chosen =
          notesForCategory[
            Math.floor(
              Math.random() *
              notesForCategory.length
            )
          ];

        openModal(`
          <div class="secret-modal">

            <p class="eyebrow">
              open when: ${escapeHTML(activeCategory)}
            </p>

            <h3>
              for you ♡
            </h3>

            <p>
              ${escapeHTML(chosen)}
            </p>

            <button
              class="button"
              type="button"
              id="anotherJarNote"
            >
              another note
            </button>

          </div>
        `);

        $('anotherJarNote')
          ?.addEventListener(
            'click',
            () => {
              closeModal();

              setTimeout(
                () =>
                  pickButton.click(),
                150
              );
            }
          );
      }
    );
  }

  /* =====================================================
     TIMELINE
     ===================================================== */

  function timeline() {
    const timelineElement =
      $('timeline');

    if (!timelineElement) return;

    timelineElement.innerHTML = '';

    safeArray(C.timeline)
      .forEach(
        (item) => {
          if (!Array.isArray(item))
            return;

          const element =
            document.createElement(
              'div'
            );

          element.className =
            'timeline-item';

          element.innerHTML = `
            <p class="eyebrow">
              ${escapeHTML(item[0] || '')}
            </p>

            <h3>
              ${escapeHTML(item[1] || '')}
            </h3>

            <p>
              ${escapeHTML(item[2] || '')}
            </p>
          `;

          timelineElement.appendChild(
            element
          );
        }
      );
  }

  /* =====================================================
     TICKETS
     ===================================================== */

  function tickets() {
    const grid =
      $('ticketGrid');

    if (!grid) return;

    const counter =
      $('ticketCount');

    const shuffle =
      $('shuffleTickets');

    const ticketData =
      safeArray(C.tickets);

    if (counter) {
      counter.textContent =
        `${ticketData.length} little tickets`;
    }

    function render(list) {
      grid.innerHTML = '';

      list.forEach(
        (ticket, index) => {
          if (!Array.isArray(ticket))
            return;

          const title =
            ticket[0] || '';

          const description =
            ticket[1] || '';

          const message =
            ticket[2] || '';

          const article =
            document.createElement(
              'article'
            );

          article.className =
            'ticket';

          article.tabIndex = 0;

          article.setAttribute(
            'role',
            'button'
          );

          article.setAttribute(
            'aria-label',
            `Flip ${title} ticket`
          );

          article.innerHTML = `
            <div class="ticket-inner">

              <div class="ticket-face ticket-front">

                <span class="ticket-no">
                  TICKET ${String(index + 1).padStart(3, '0')}
                </span>

                <div class="ticket-title">
                  ${escapeHTML(title)}
                </div>

                <p class="ticket-desc">
                  ${escapeHTML(description)}
                </p>

                <div class="valid">
                  VALID FOR ${
                    escapeHTML(
                      String(
                        C.name || 'SATVIKI'
                      ).toUpperCase()
                    )
                  } ♡
                </div>

                <div class="ticket-stub">
                  FLIP ME · ♡
                </div>

              </div>

              <div class="ticket-face ticket-back">

                <div>

                  <p class="eyebrow">
                    a little note
                  </p>

                  <p>
                    ${escapeHTML(message)}
                  </p>

                  <div class="stamp">
                    REDEEMED WITH LOVE
                  </div>

                </div>

                <div class="ticket-stub">
                  TICKET ${String(index + 1).padStart(3, '0')}
                </div>

              </div>

            </div>
          `;

          function flip() {
            article.classList.toggle(
              'flipped'
            );
          }

          article.addEventListener(
            'click',
            flip
          );

          article.addEventListener(
            'keydown',
            (event) => {
              if (
                event.key === 'Enter' ||
                event.key === ' '
              ) {
                event.preventDefault();
                flip();
              }
            }
          );

          grid.appendChild(
            article
          );
        }
      );
    }

    render(ticketData);

    shuffle?.addEventListener(
      'click',
      () => {
        const shuffled =
          [...ticketData].sort(
            () =>
              Math.random() - 0.5
          );

        render(shuffled);
      }
    );
  }

  /* =====================================================
     GALLERY
     ===================================================== */

  function gallery() {
    const galleryElement =
      $('gallery');

    if (!galleryElement) return;

    galleryElement.innerHTML = '';

    const items =
      safeArray(C.gallery);

    items.forEach(
      (item, index) => {
        if (!Array.isArray(item))
          return;

        const title =
          item[0] ||
          `Memory ${index + 1}`;

        const imagePath =
          item[1] ||
          '';

        const number =
          item[2] ||
          String(index + 1);

        const card =
          document.createElement(
            'article'
          );

        card.className =
          'polaroid';

        const photoBox =
          document.createElement(
            'div'
          );

        photoBox.className =
          'ph';

        const errorLabel =
          document.createElement(
            'span'
          );

        errorLabel.className =
          'photo-error';

        errorLabel.textContent =
          imagePath
            ? 'photo not found'
            : 'add your photo';

        errorLabel.style.display =
          imagePath
            ? 'none'
            : 'block';

        if (imagePath) {
          const image =
            document.createElement(
              'img'
            );

          image.src =
            imagePath;

          image.alt =
            title;

          image.loading =
            'lazy';

          image.decoding =
            'async';

          image.addEventListener(
            'error',
            () => {
              image.style.display =
                'none';

              photoBox.classList.add(
                'image-error'
              );

              errorLabel.style.display =
                'block';
            }
          );

          image.addEventListener(
            'load',
            () => {
              image.style.display =
                'block';

              photoBox.classList.remove(
                'image-error'
              );

              errorLabel.style.display =
                'none';
            }
          );

          photoBox.appendChild(
            image
          );
        }

        photoBox.appendChild(
          errorLabel
        );

        const caption =
          document.createElement(
            'p'
          );

        caption.textContent =
          title;

        const small =
          document.createElement(
            'small'
          );

        small.className =
          'memory-number';

        small.textContent =
          number;

        card.appendChild(
          photoBox
        );

        card.appendChild(
          caption
        );

        card.appendChild(
          small
        );

        if (imagePath) {
          card.addEventListener(
            'click',
            () => {
              openModal(`
                <div class="secret-modal">

                  <p class="eyebrow">
                    memory ${escapeHTML(number)}
                  </p>

                  <h3>
                    ${escapeHTML(title)}
                  </h3>

                  <img
                    src="${escapeHTML(imagePath)}"
                    alt="${escapeHTML(title)}"
                    style="
                      width:100%;
                      max-height:65vh;
                      object-fit:contain;
                      display:block;
                      margin:20px auto;
                      border-radius:4px;
                    "
                  >

                </div>
              `);
            }
          );
        }

        galleryElement.appendChild(
          card
        );
      }
    );
  }

  /* =====================================================
     QUIZ
     ===================================================== */

  function quiz() {
    const question =
      $('quizQuestion');

    const options =
      $('quizOptions');

    const result =
      $('quizResult');

    if (
      !question ||
      !options ||
      !result
    ) {
      return;
    }

    const data =
      safeArray(C.quiz);

    let current = 0;
    let score = 0;

    function showQuestion() {
      if (current >= data.length) {
        question.textContent =
          'That concludes the very serious research.';

        options.innerHTML = '';

        result.textContent =
          `${score}/${data.length} ♡ ${
            score === data.length
              ? 'okay, you definitely know us.'
              : 'still pretty adorable.'
          }`;

        return;
      }

      const currentQuestion =
        data[current];

      const prompt =
        currentQuestion?.[0] || '';

      const choices =
        safeArray(
          currentQuestion?.[1]
        );

      const correct =
        Number(
          currentQuestion?.[2] ?? 0
        );

      question.textContent =
        prompt;

      options.innerHTML = '';

      choices.forEach(
        (choice, index) => {
          const button =
            document.createElement(
              'button'
            );

          button.type =
            'button';

          button.className =
            'quiz-option';

          button.textContent =
            choice;

          button.addEventListener(
            'click',
            () => {
              if (index === correct) {
                score++;
              }

              current++;

              showQuestion();
            }
          );

          options.appendChild(
            button
          );
        }
      );
    }

    showQuestion();
  }

  /* =====================================================
     MUSIC
     Song is in SAME folder as index.html
     ===================================================== */

  function music() {
    const audio =
      $('song');

    const toggle =
      $('musicToggle');

    const label =
      $('musicText');

    if (!audio || !toggle) {
      return;
    }

    const songPath =
      String(
        C.song || 'our-song.mp3'
      ).trim();

    audio.src =
      songPath;

    audio.preload =
      'metadata';

    audio.addEventListener(
      'error',
      () => {
        console.warn(
          `Could not load song: ${songPath}`
        );

        if (label) {
          label.textContent =
            'song unavailable';
        }
      },
      { once: true }
    );

    toggle.addEventListener(
      'click',
      async () => {
        try {
          if (audio.paused) {
            await audio.play();

            document.body
              .classList
              .add(
                'music-playing'
              );

            if (label) {
              label.textContent =
                'playing our song';
            }
          } else {
            audio.pause();

            document.body
              .classList
              .remove(
                'music-playing'
              );

            if (label) {
              label.textContent =
                'our little song';
            }
          }
        } catch (error) {
          console.warn(
            'Audio playback error:',
            error
          );

          if (label) {
            label.textContent =
              'song unavailable';
          }

          alert(
            `The song could not be played. Make sure "${songPath}" is in the same folder as index.html.`
          );
        }
      }
    );

    audio.addEventListener(
      'play',
      () => {
        document.body
          .classList
          .add(
            'music-playing'
          );

        if (label) {
          label.textContent =
            'playing our song';
        }
      }
    );

    audio.addEventListener(
      'pause',
      () => {
        document.body
          .classList
          .remove(
            'music-playing'
          );

        if (
          !audio.ended &&
          label
        ) {
          label.textContent =
            'our little song';
        }
      }
    );

    audio.addEventListener(
      'ended',
      () => {
        document.body
          .classList
          .remove(
            'music-playing'
          );

        if (label) {
          label.textContent =
            'our little song';
        }
      }
    );
  }

  /* =====================================================
     SECRET MESSAGE
     ===================================================== */

  function secret() {
    const trigger =
      $('secretTrigger');

    if (!trigger) return;

    let found = false;

    trigger.addEventListener(
      'click',
      () => {
        if (found) return;

        found = true;

        openModal(`
          <div class="secret-modal">

            <p class="eyebrow">
              you found the hidden thing
            </p>

            <h3>
              hi, ${escapeHTML(
                C.name || 'Satviki'
              )} ♡
            </h3>

            <p>
              There is no secret trick here.
              I just wanted one more excuse to tell
              you that these three months have meant
              a lot to me.
            </p>

          </div>
        `);
      }
    );
  }

  /* =====================================================
     NAVIGATION
     ===================================================== */

  function navigation() {
    const intro =
      $('intro');

    $('enterBtn')
      ?.addEventListener(
        'click',
        () => {
          intro?.classList.add(
            'done'
          );

          setTimeout(
            () => {
              $('booth')
                ?.scrollIntoView({
                  behavior:
                    'smooth'
                });
            },
            350
          );
        }
      );

    $('replay')
      ?.addEventListener(
        'click',
        () => {
          window.scrollTo({
            top: 0,
            behavior:
              'smooth'
          });

          intro?.classList.remove(
            'done'
          );

          heartIntro();
        }
      );
  }

  /* =====================================================
     MODAL EVENTS
     ===================================================== */

  function modalEvents() {
    $('modalClose')
      ?.addEventListener(
        'click',
        closeModal
      );

    document
      .querySelector(
        '.modal-backdrop'
      )
      ?.addEventListener(
        'click',
        closeModal
      );

    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key ===
          'Escape'
        ) {
          closeModal();
        }
      }
    );
  }

  /* =====================================================
     CLEANUP
     ===================================================== */

  function cleanup() {
    try {
      if (
        window.CameraBooth &&
        typeof window.CameraBooth.stop ===
        'function'
      ) {
        window.CameraBooth.stop();
      }
    } catch (error) {
      console.warn(
        'Camera cleanup failed:',
        error
      );
    }
  }

  /* =====================================================
     INIT
     ===================================================== */

  function init() {

    try {
      heartIntro();
    } catch (error) {
      console.error(
        'Heart intro error:',
        error
      );
    }

    try {
      notes();
    } catch (error) {
      console.error(
        'Notes error:',
        error
      );
    }

    try {
      jar();
    } catch (error) {
      console.error(
        'Jar error:',
        error
      );
    }

    try {
      timeline();
    } catch (error) {
      console.error(
        'Timeline error:',
        error
      );
    }

    try {
      tickets();
    } catch (error) {
      console.error(
        'Tickets error:',
        error
      );
    }

    try {
      gallery();
    } catch (error) {
      console.error(
        'Gallery error:',
        error
      );
    }

    try {
      quiz();
    } catch (error) {
      console.error(
        'Quiz error:',
        error
      );
    }

    try {
      music();
    } catch (error) {
      console.error(
        'Music error:',
        error
      );
    }

    try {
      secret();
    } catch (error) {
      console.error(
        'Secret message error:',
        error
      );
    }

    try {
      navigation();
    } catch (error) {
      console.error(
        'Navigation error:',
        error
      );
    }

    try {
      modalEvents();
    } catch (error) {
      console.error(
        'Modal error:',
        error
      );
    }

    /*
      Camera and co-op modules are isolated.
      Failure in either one must not stop
      the rest of the website.
    */

    try {
      if (
        window.CameraBooth &&
        typeof window.CameraBooth.init ===
        'function'
      ) {
        window.CameraBooth.init();
      }
    } catch (error) {
      console.error(
        'Camera initialization failed:',
        error
      );
    }

    try {
      if (
        window.CoopBooth &&
        typeof window.CoopBooth.init ===
        'function'
      ) {
        window.CoopBooth.init();
      }
    } catch (error) {
      console.error(
        'Co-op initialization failed:',
        error
      );
    }

    window.addEventListener(
      'beforeunload',
      cleanup
    );
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );
  } else {
    init();
  }

})();
```
