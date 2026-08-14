(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const PREFIX = 'satviki-coop-';

  let peer = null;
  let connection = null;
  let mediaCall = null;
  let localStream = null;

  let roomCode = '';
  let isHost = false;

  let connected = false;
  let connecting = false;
  let captureRunning = false;

  let myPhoto = null;
  let partnerPhoto = null;


  /* =====================================================
     STATUS
     ===================================================== */

  function setStatus(text, live = false) {
    const status = $('coopStatus');
    const dot = document.querySelector('.coop-live-dot');

    if (status) {
      status.textContent = text;
    }

    if (dot) {
      dot.classList.toggle('live', live);
    }
  }


  /* =====================================================
     ROOM HELPERS
     ===================================================== */

  function cleanCode(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
  }


  function makeRoomCode() {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let code = '';

    for (let i = 0; i < 6; i++) {
      code += chars[
        Math.floor(
          Math.random() * chars.length
        )
      ];
    }

    return code;
  }


  function hostPeerId(code) {
    return PREFIX + code.toLowerCase();
  }


  /* =====================================================
     LOCAL CAMERA
     ===================================================== */

  async function getLocalStream() {

    if (localStream) {
      return localStream;
    }

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(
        'Camera API unavailable'
      );
    }

    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          }
        },
        audio: false
      });

    return localStream;
  }


  /* =====================================================
     REMOTE VIDEO
     ===================================================== */

  function showRemoteStream(stream) {

    const video =
      $('remoteVideo');

    const placeholder =
      $('remotePlaceholder');

    if (!video) {
      return;
    }

    if (!stream) {

      video.srcObject = null;

      if (placeholder) {
        placeholder.hidden = false;
      }

      return;
    }

    video.srcObject =
      stream;

    video.muted = true;

    video.playsInline = true;

    const playPromise =
      video.play();

    if (
      playPromise &&
      typeof playPromise.catch === 'function'
    ) {
      playPromise.catch(() => {});
    }

    if (placeholder) {
      placeholder.hidden = true;
    }
  }


  /* =====================================================
     DATA CONNECTION
     ===================================================== */

  function send(data) {

    if (
      !connection ||
      !connection.open
    ) {
      return false;
    }

    try {

      connection.send(data);

      return true;

    } catch (error) {

      console.error(
        'Co-op data send failed:',
        error
      );

      return false;
    }
  }


  function setupDataConnection(conn) {

    connection = conn;


    conn.on(
      'open',
      () => {

        connected = true;

        setStatus(
          'connected',
          true
        );


        send({
          type: 'hello'
        });


        /*
          IMPORTANT:
          Only the GUEST starts the media call.
          The HOST only answers it.
          This prevents both browsers from
          creating calls simultaneously.
        */

        if (!isHost) {

          setTimeout(
            () => startGuestVideoCall(),
            250
          );

        }
      }
    );


    conn.on(
      'data',
      handleData
    );


    conn.on(
      'close',
      () => {

        connected = false;

        setStatus(
          'partner disconnected'
        );

        showRemoteStream(null);

      }
    );


    conn.on(
      'error',
      (error) => {

        console.error(
          'Data connection error:',
          error
        );

        connected = false;

        setStatus(
          'connection issue'
        );

      }
    );
  }


  /* =====================================================
     DATA EVENTS
     ===================================================== */

  function handleData(data) {

    if (
      !data ||
      typeof data !== 'object'
    ) {
      return;
    }


    if (
      data.type ===
      'hello'
    ) {

      send({
        type: 'hello-ack'
      });

      return;
    }


    if (
      data.type ===
      'hello-ack'
    ) {

      setStatus(
        'connected',
        true
      );

      return;
    }


    if (
      data.type ===
      'filter'
    ) {

      if (
        window.CameraBooth &&
        typeof window.CameraBooth.setFilter ===
        'function'
      ) {

        window.CameraBooth.setFilter(
          data.filter,
          false
        );

      }

      return;
    }


    if (
      data.type ===
      'capture'
    ) {

      takeCoopPhoto(false);

      return;
    }


    if (
      data.type ===
      'photo'
    ) {

      partnerPhoto =
        data.data || null;


      if (
        isHost &&
        myPhoto &&
        partnerPhoto
      ) {

        createCombinedPhoto(
          myPhoto,
          partnerPhoto
        );

      }

    }

  }


  /* =====================================================
     CREATE ROOM
     ===================================================== */

  async function createRoom() {

    if (connecting) {
      return;
    }

    if (!window.Peer) {

      alert(
        'PeerJS could not load. Check your internet connection and reload the page.'
      );

      return;
    }


    isHost = true;
    connecting = true;

    roomCode =
      makeRoomCode();


    const roomField =
      $('roomCode');

    if (roomField) {
      roomField.value =
        roomCode;
    }


    setStatus(
      'creating room...'
    );


    try {

      /*
        Randomness is built into the room code.
        The host peer ID is therefore very unlikely
        to collide with another active room.
      */

      peer =
        new Peer(
          hostPeerId(roomCode),
          {
            debug: 2,

            /*
              Explicit STUN server.
              PeerJS already supplies a default STUN
              configuration, but keeping it explicit
              makes the connection configuration clear.
            */

            config: {
              iceServers: [
                {
                  urls:
                    'stun:stun.l.google.com:19302'
                }
              ]
            }
          }
        );


      peer.on(
        'open',
        async () => {

          connecting = false;

          setStatus(
            'waiting for Satviki',
            true
          );


          try {

            /*
              Ask for host camera permission now.
            */

            await getLocalStream();

          } catch (error) {

            console.error(
              'Host camera error:',
              error
            );

            alert(
              'Camera access is required for the co-op booth. Please allow camera access and create the room again.'
            );

          }

        }
      );


      /*
        Guest's data connection arrives here.
      */

      peer.on(
        'connection',
        (conn) => {

          setStatus(
            'partner joining...'
          );

          setupDataConnection(
            conn
          );

        }
      );


      /*
        Guest's one and only media call
        arrives here.
      */

      peer.on(
        'call',
        async (call) => {

          await answerGuestCall(
            call
          );

        }
      );


      peer.on(
        'error',
        (error) => {

          console.error(
            'PeerJS host error:',
            error
          );

          connecting = false;


          if (
            error.type ===
            'unavailable-id'
          ) {

            setStatus(
              'room unavailable'
            );

            alert(
              'That room code was already in use. Please create the room again.'
            );

          } else {

            setStatus(
              error.type ||
              'connection issue'
            );

          }

        }
      );


      peer.on(
        'disconnected',
        () => {

          setStatus(
            'signaling disconnected'
          );

        }
      );


    } catch (error) {

      console.error(
        'Create room error:',
        error
      );

      connecting = false;

      setStatus(
        'could not create room'
      );

    }

  }


  /* =====================================================
     JOIN ROOM
     ===================================================== */

  async function joinRoom() {

    if (connecting) {
      return;
    }

    if (!window.Peer) {

      alert(
        'PeerJS could not load. Check your internet connection and reload the page.'
      );

      return;
    }


    const roomField =
      $('roomCode');


    roomCode =
      cleanCode(
        roomField?.value
      );


    if (roomField) {
      roomField.value =
        roomCode;
    }


    if (
      roomCode.length !== 6
    ) {

      alert(
        'Enter the complete 6-character room code.'
      );

      roomField?.focus();

      return;
    }


    isHost = false;
    connecting = true;


    setStatus(
      'joining room...'
    );


    try {

      /*
        Guest uses a RANDOM peer ID.

        This is important because only the host
        uses the predictable room-based ID.
      */

      peer =
        new Peer({
          debug: 2,

          config: {
            iceServers: [
              {
                urls:
                  'stun:stun.l.google.com:19302'
              }
            ]
          }
        });


      peer.on(
        'open',
        async () => {

          try {

            await getLocalStream();

          } catch (error) {

            console.error(
              'Guest camera error:',
              error
            );

            connecting = false;

            alert(
              'Camera access is required for the co-op booth. Please allow camera access and try again.'
            );

            return;
          }


          /*
            Connect guest -> host.
          */

          const conn =
            peer.connect(
              hostPeerId(roomCode),
              {
                reliable: true,

                serialization: 'json'
              }
            );


          if (!conn) {

            connecting = false;

            setStatus(
              'could not connect'
            );

            return;
          }


          setupDataConnection(
            conn
          );

        }
      );


      /*
        Guest can also receive the host's
        media call if the browser/network
        establishes it.
      */

      peer.on(
        'call',
        async (call) => {

          await answerGuestCall(
            call
          );

        }
      );


      peer.on(
        'error',
        (error) => {

          console.error(
            'PeerJS guest error:',
            error
          );

          connecting = false;


          if (
            error.type ===
            'peer-unavailable'
          ) {

            setStatus(
              'room not found'
            );

            alert(
              'Room not found. Ask the host to create a fresh room and send you the new code.'
            );

          } else {

            setStatus(
              error.type ||
              'connection issue'
            );

          }

        }
      );


      peer.on(
        'disconnected',
        () => {

          setStatus(
            'signaling disconnected'
          );

        }
      );


    } catch (error) {

      console.error(
        'Join room error:',
        error
      );

      connecting = false;

      setStatus(
        'join failed'
      );

    }

  }


  /* =====================================================
     GUEST STARTS VIDEO CALL
     ===================================================== */

  async function startGuestVideoCall() {

    if (
      isHost ||
      !peer ||
      !peer.open ||
      !roomCode
    ) {
      return;
    }


    /*
      Don't create another call if one already exists.
    */

    if (
      mediaCall &&
      !mediaCall.destroyed
    ) {
      return;
    }


    try {

      const stream =
        await getLocalStream();


      setStatus(
        'starting camera link...',
        true
      );


      const call =
        peer.call(
          hostPeerId(roomCode),
          stream,
          {
            metadata: {
              room: 'satviki-coop',
              code: roomCode
            }
          }
        );


      if (!call) {
        throw new Error(
          'PeerJS media call could not be created.'
        );
      }


      mediaCall =
        call;


      call.on(
        'stream',
        (stream) => {

          showRemoteStream(
            stream
          );

          setStatus(
            'together ♡',
            true
          );

        }
      );


      call.on(
        'close',
        () => {

          mediaCall =
            null;

          showRemoteStream(
            null
          );

        }
      );


      call.on(
        'error',
        (error) => {

          console.error(
            'Guest media error:',
            error
          );

          mediaCall =
            null;

          setStatus(
            'video connection issue'
          );

        }
      );


    } catch (error) {

      console.error(
        'Guest call failed:',
        error
      );

      setStatus(
        'video connection issue'
      );

    }

  }


  /* =====================================================
     HOST ANSWERS VIDEO CALL
     ===================================================== */

  async function answerGuestCall(call) {

    try {

      const stream =
        await getLocalStream();


      /*
        Host answers instead of starting another
        call. This avoids offer/answer collisions.
      */

      call.answer(
        stream
      );


      mediaCall =
        call;


      call.on(
        'stream',
        (stream) => {

          showRemoteStream(
            stream
          );

          setStatus(
            'together ♡',
            true
          );

        }
      );


      call.on(
        'close',
        () => {

          mediaCall =
            null;

          showRemoteStream(
            null
          );

        }
      );


      call.on(
        'error',
        (error) => {

          console.error(
            'Host media error:',
            error
          );

          mediaCall =
            null;

          setStatus(
            'video connection issue'
          );

        }
      );


    } catch (error) {

      console.error(
        'Could not answer guest call:',
        error
      );

      setStatus(
        'camera connection issue'
      );

    }

  }


  /* =====================================================
     FILTER SYNC
     ===================================================== */

  function syncFilter(filter) {

    if (!connected) {
      return;
    }

    send({
      type: 'filter',
      filter
    });

  }


  /* =====================================================
     CO-OP PHOTO
     ===================================================== */

  async function takeCoopPhoto(
    broadcast = true
  ) {

    if (captureRunning) {
      return;
    }


    if (
      !connected ||
      !connection?.open
    ) {

      alert(
        'Satviki needs to be connected before taking a co-op photo.'
      );

      return;
    }


    captureRunning = true;


    try {

      /*
        Host initiates synchronized capture.
      */

      if (broadcast) {

        const sent =
          send({
            type: 'capture'
          });

        if (!sent) {

          alert(
            'The co-op connection is not ready yet.'
          );

          return;
        }
      }


      if (
        window.CameraBooth &&
        typeof window.CameraBooth.captureNow ===
        'function'
      ) {

        await window.CameraBooth
          .captureNow();

      }


      myPhoto =
        window.CameraBooth?.getLastPhoto?.() ||
        null;


      if (!myPhoto) {
        return;
      }


      send({
        type: 'photo',
        data: myPhoto
      });


      /*
        Host waits for guest photo.
      */

      if (
        isHost &&
        partnerPhoto
      ) {

        await createCombinedPhoto(
          myPhoto,
          partnerPhoto
        );

      }


    } catch (error) {

      console.error(
        'Co-op photo error:',
        error
      );

    } finally {

      setTimeout(
        () => {
          captureRunning = false;
        },
        800
      );

    }

  }


  /* =====================================================
     IMAGE LOADING
     ===================================================== */

  function loadImage(src) {

    return new Promise(
      (resolve, reject) => {

        const image =
          new Image();

        image.onload =
          () => resolve(image);

        image.onerror =
          () =>
            reject(
              new Error(
                'Unable to load photo.'
              )
            );

        image.src =
          src;
      }
    );

  }


  /* =====================================================
     COMBINE BOTH PHOTOS
     ===================================================== */

  async function createCombinedPhoto(
    firstSource,
    secondSource
  ) {

    try {

      const [
        first,
        second
      ] =
        await Promise.all([
          loadImage(firstSource),
          loadImage(secondSource)
        ]);


      const canvas =
        document.createElement(
          'canvas'
        );

      const ctx =
        canvas.getContext(
          '2d'
        );


      if (!ctx) {
        return;
      }


      const width = 1400;
      const height = 900;

      const padding = 35;
      const header = 90;
      const footer = 55;

      const panelWidth =
        (width -
          padding * 3) /
        2;

      const panelHeight =
        height -
        header -
        footer -
        padding * 2;


      canvas.width =
        width;

      canvas.height =
        height;


      ctx.fillStyle =
        '#fffaf5';

      ctx.fillRect(
        0,
        0,
        width,
        height
      );


      ctx.fillStyle =
        '#5b2934';

      ctx.textAlign =
        'center';

      ctx.font =
        '500 34px Georgia';

      ctx.fillText(
        'three months · together ♡',
        width / 2,
        52
      );


      drawCover(
        ctx,
        first,
        padding,
        header,
        panelWidth,
        panelHeight
      );


      drawCover(
        ctx,
        second,
        padding * 2 +
          panelWidth,
        header,
        panelWidth,
        panelHeight
      );


      ctx.fillStyle =
        '#a85d69';

      ctx.font =
        'italic 22px Georgia';

      ctx.fillText(
        'made in the co-op booth',
        width / 2,
        height - 22
      );


      const result =
        canvas.toDataURL(
          'image/jpeg',
          0.94
        );


      window.CameraBooth?.showResult(
        result
      );

      window.CameraBooth?.setLastPhoto(
        result
      );


      const download =
        document.createElement(
          'a'
        );

      download.href =
        result;

      download.download =
        'satviki-co-op-photo.jpg';

      document.body.appendChild(
        download
      );

      download.click();

      download.remove();


      partnerPhoto =
        null;

    } catch (error) {

      console.error(
        'Combined photo error:',
        error
      );

      alert(
        'Both photos were received, but the combined photo could not be created.'
      );

    }

  }


  function drawCover(
    ctx,
    image,
    x,
    y,
    width,
    height
  ) {

    const sourceRatio =
      image.width /
      image.height;

    const targetRatio =
      width /
      height;

    let sourceWidth =
      image.width;

    let sourceHeight =
      image.height;

    let sourceX = 0;
    let sourceY = 0;


    if (
      sourceRatio >
      targetRatio
    ) {

      sourceWidth =
        image.height *
        targetRatio;

      sourceX =
        (
          image.width -
          sourceWidth
        ) / 2;

    } else {

      sourceHeight =
        image.width /
        targetRatio;

      sourceY =
        (
          image.height -
          sourceHeight
        ) / 2;
    }


    ctx.drawImage(
      image,

      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,

      x,
      y,
      width,
      height
    );

  }


  /* =====================================================
     COPY ROOM
     ===================================================== */

  async function copyRoom() {

    const field =
      $('roomCode');

    const button =
      $('copyRoom');

    const code =
      cleanCode(
        field?.value
      );


    if (!code) {
      return;
    }


    try {

      await navigator
        .clipboard
        .writeText(code);


      if (button) {

        const previous =
          button.textContent;

        button.textContent =
          'copied';

        setTimeout(
          () => {
            button.textContent =
              previous;
          },
          1200
        );

      }

    } catch (error) {

      if (field) {

        field.focus();
        field.select();

        try {
          document.execCommand(
            'copy'
          );
        } catch (_) {}

      }

    }

  }


  /* =====================================================
     CLEANUP
     ===================================================== */

  function destroy() {

    try {

      if (connection) {
        connection.close();
      }

    } catch (_) {}


    try {

      if (mediaCall) {
        mediaCall.close();
      }

    } catch (_) {}


    try {

      if (localStream) {

        localStream
          .getTracks()
          .forEach(
            track => track.stop()
          );

      }

    } catch (_) {}


    try {

      if (peer) {
        peer.destroy();
      }

    } catch (_) {}


    connection = null;
    mediaCall = null;
    localStream = null;
    peer = null;

    connected = false;
    connecting = false;

    myPhoto = null;
    partnerPhoto = null;

    showRemoteStream(
      null
    );

    setStatus(
      'offline',
      false
    );
  }


  /* =====================================================
     INIT
     ===================================================== */

  function init() {

    $('createRoom')
      ?.addEventListener(
        'click',
        createRoom
      );


    $('joinRoom')
      ?.addEventListener(
        'click',
        joinRoom
      );


    $('copyRoom')
      ?.addEventListener(
        'click',
        copyRoom
      );


    $('roomCode')
      ?.addEventListener(
        'input',
        () => {

          const field =
            $('roomCode');

          if (field) {

            field.value =
              cleanCode(
                field.value
              );

          }

        }
      );


    $('roomCode')
      ?.addEventListener(
        'keydown',
        (event) => {

          if (
            event.key === 'Enter'
          ) {

            event.preventDefault();

            joinRoom();

          }

        }
      );


    /*
      IMPORTANT:
      Do not attach another capture listener here.

      The normal camera button is handled by camera.js.
      The co-op button should be wired separately if you
      want the normal capture button to become co-op-aware.
    */


    setStatus(
      'offline',
      false
    );


    window.addEventListener(
      'beforeunload',
      destroy
    );

  }


  window.CoopBooth = {

    init,

    syncFilter,

    startSynchronizedCapture:
      takeCoopPhoto,

    destroy

  };

})();
