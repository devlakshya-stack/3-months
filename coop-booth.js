(() => {
  'use strict';

  /*
    CO-OP PHOTO BOOTH
    -----------------
    This file is intentionally isolated from the rest
    of the website.

    If PeerJS/camera/network fails, the main website
    continues working normally.
  */

  const $ = (id) => document.getElementById(id);

  let peer = null;
  let connection = null;
  let call = null;
  let localStream = null;

  let roomCode = '';
  let isHost = false;
  let connected = false;
  let destroyed = false;

  let myPhoto = null;
  let partnerPhoto = null;

  let captureInProgress = false;

  const PEER_PREFIX = 'satviki-room-';


  /* =====================================================
     UI
     ===================================================== */

  function setStatus(text, live = false) {

    const status =
      $('coopStatus');

    const dot =
      document.querySelector(
        '.coop-live-dot'
      );

    if (status) {
      status.textContent = text;
    }

    if (dot) {
      dot.classList.toggle(
        'live',
        live
      );
    }
  }


  function getRoomInput() {
    return $('roomCode');
  }


  function getRoomCode() {

    return String(
      getRoomInput()?.value || ''
    )
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        ''
      )
      .slice(0, 6);
  }


  function setRoomCode(code) {

    const input =
      getRoomInput();

    if (input) {
      input.value =
        code;
    }
  }


  /* =====================================================
     ROOM CODE
     ===================================================== */

  function generateRoomCode() {

    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let result = '';

    for (let i = 0; i < 6; i++) {

      result +=
        chars[
          Math.floor(
            Math.random() *
            chars.length
          )
        ];

    }

    return result;
  }


  function roomPeerId(code) {

    return (
      PEER_PREFIX +
      code.toLowerCase()
    );

  }


  /* =====================================================
     LOCAL CAMERA
     ===================================================== */

  async function getCamera() {

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

  function showRemoteVideo(stream) {

    const video =
      $('remoteVideo');

    const placeholder =
      $('remotePlaceholder');

    if (!video) {
      return;
    }

    if (!stream) {

      video.srcObject =
        null;

      if (placeholder) {
        placeholder.hidden =
          false;
      }

      return;
    }

    video.srcObject =
      stream;

    video.muted =
      true;

    video.playsInline =
      true;

    if (placeholder) {
      placeholder.hidden =
        true;
    }

    const play =
      video.play();

    if (
      play &&
      typeof play.catch ===
      'function'
    ) {
      play.catch(() => {});
    }
  }


  /* =====================================================
     SAFE SEND
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

      console.warn(
        'Co-op data send failed:',
        error
      );

      return false;
    }
  }


  /* =====================================================
     DATA CONNECTION
     ===================================================== */

  function setupConnection(conn) {

    connection =
      conn;

    conn.on(
      'open',
      () => {

        connected =
          true;

        setStatus(
          'connected',
          true
        );

        send({
          type: 'hello'
        });


        /*
          Only the guest starts the video call.
          The host waits and answers.
        */

        if (!isHost) {

          setTimeout(
            () => {
              startGuestCall();
            },
            300
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

        connected =
          false;

        setStatus(
          'partner disconnected'
        );

        showRemoteVideo(
          null
        );

      }
    );


    conn.on(
      'error',
      (error) => {

        console.warn(
          'Co-op connection error:',
          error
        );

        connected =
          false;

        setStatus(
          'connection issue'
        );

      }
    );

  }


  /* =====================================================
     DATA HANDLER
     ===================================================== */

  function handleData(data) {

    if (
      !data ||
      typeof data !==
      'object'
    ) {
      return;
    }


    /* Handshake */

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
        'together',
        true
      );

      return;
    }


    /* Filter sync */

    if (
      data.type ===
      'filter'
    ) {

      try {

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

      } catch (error) {

        console.warn(
          'Remote filter error:',
          error
        );

      }

      return;
    }


    /* Synchronized capture */

    if (
      data.type ===
      'capture'
    ) {

      captureLocally(
        false
      );

      return;
    }


    /* Partner photo */

    if (
      data.type ===
      'photo'
    ) {

      partnerPhoto =
        data.data ||
        null;


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

    if (destroyed) {
      return;
    }

    if (
      typeof window.Peer !==
      'function'
    ) {

      alert(
        'The co-op connection service could not load. Please check your internet connection and reload the page.'
      );

      return;
    }


    if (peer) {
      cleanupConnection();
    }


    isHost =
      true;

    connected =
      false;


    roomCode =
      generateRoomCode();


    setRoomCode(
      roomCode
    );


    setStatus(
      'creating room...'
    );


    try {

      peer =
        new window.Peer(
          roomPeerId(
            roomCode
          ),
          {
            debug: 0
          }
        );


      peer.on(
        'open',
        async () => {

          setStatus(
            'waiting for Satviki',
            true
          );


          /*
            Camera permission is requested only
            after user explicitly creates the room.
          */

          try {

            await getCamera();

          } catch (error) {

            console.warn(
              'Host camera unavailable:',
              error
            );

            alert(
              'Camera access is needed for the co-op booth. You can still use the normal photo booth.'
            );

          }

        }
      );


      peer.on(
        'connection',
        (conn) => {

          setupConnection(
            conn
          );

        }
      );


      peer.on(
        'call',
        (incomingCall) => {

          answerCall(
            incomingCall
          );

        }
      );


      peer.on(
        'error',
        (error) => {

          console.warn(
            'PeerJS host error:',
            error
          );

          if (
            error?.type ===
            'unavailable-id'
          ) {

            setStatus(
              'room retry'
            );

            setTimeout(
              () => {

                if (!destroyed) {
                  createRoom();
                }

              },
              350
            );

          } else {

            setStatus(
              'connection issue'
            );

          }

        }
      );


    } catch (error) {

      console.error(
        'Create room error:',
        error
      );

      setStatus(
        'co-op unavailable'
      );

    }

  }


  /* =====================================================
     JOIN ROOM
     ===================================================== */

  async function joinRoom() {

    if (destroyed) {
      return;
    }

    if (
      typeof window.Peer !==
      'function'
    ) {

      alert(
        'The co-op connection service could not load. Please check your internet connection and reload the page.'
      );

      return;
    }


    roomCode =
      getRoomCode();


    if (
      roomCode.length !==
      6
    ) {

      alert(
        'Please enter the complete 6-character room code.'
      );

      getRoomInput()?.focus();

      return;
    }


    if (peer) {
      cleanupConnection();
    }


    isHost =
      false;

    connected =
      false;


    setStatus(
      'joining room...'
    );


    try {

      /*
        Guest receives a random PeerJS ID.
      */

      peer =
        new window.Peer({
          debug: 0
        });


      peer.on(
        'open',
        async () => {

          try {

            await getCamera();

          } catch (error) {

            console.warn(
              'Guest camera unavailable:',
              error
            );

            alert(
              'Please allow camera access for the co-op booth.'
            );

            return;
          }


          const conn =
            peer.connect(
              roomPeerId(
                roomCode
              ),
              {
                reliable: true
              }
            );


          if (!conn) {

            setStatus(
              'room unavailable'
            );

            return;
          }


          setupConnection(
            conn
          );

        }
      );


      peer.on(
        'call',
        (incomingCall) => {

          answerCall(
            incomingCall
          );

        }
      );


      peer.on(
        'error',
        (error) => {

          console.warn(
            'PeerJS join error:',
            error
          );


          if (
            error?.type ===
            'peer-unavailable'
          ) {

            setStatus(
              'room not found'
            );

            alert(
              'Room not found. Create a new room and send the new code.'
            );

          } else {

            setStatus(
              'connection issue'
            );

          }

        }
      );


    } catch (error) {

      console.error(
        'Join room error:',
        error
      );

      setStatus(
        'join failed'
      );

    }

  }


  /* =====================================================
     VIDEO CALL
     ===================================================== */

  async function startGuestCall() {

    if (
      isHost ||
      !peer ||
      !peer.open ||
      !roomCode
    ) {
      return;
    }


    if (
      call &&
      !call.destroyed
    ) {
      return;
    }


    try {

      const stream =
        await getCamera();


      call =
        peer.call(
          roomPeerId(
            roomCode
          ),
          stream
        );


      if (!call) {
        throw new Error(
          'Unable to create video call.'
        );
      }


      call.on(
        'stream',
        (stream) => {

          showRemoteVideo(
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

          call =
            null;

          showRemoteVideo(
            null
          );

        }
      );


      call.on(
        'error',
        (error) => {

          console.warn(
            'Guest call error:',
            error
          );

          setStatus(
            'video connection issue'
          );

        }
      );


    } catch (error) {

      console.warn(
        'Guest video call failed:',
        error
      );

      setStatus(
        'video connection issue'
      );

    }

  }


  async function answerCall(
    incomingCall
  ) {

    try {

      const stream =
        await getCamera();


      incomingCall.answer(
        stream
      );


      call =
        incomingCall;


      incomingCall.on(
        'stream',
        (stream) => {

          showRemoteVideo(
            stream
          );

          setStatus(
            'together ♡',
            true
          );

        }
      );


      incomingCall.on(
        'close',
        () => {

          call =
            null;

          showRemoteVideo(
            null
          );

        }
      );


      incomingCall.on(
        'error',
        (error) => {

          console.warn(
            'Host call error:',
            error
          );

          setStatus(
            'video connection issue'
          );

        }
      );


    } catch (error) {

      console.warn(
        'Could not answer video call:',
        error
      );

      setStatus(
        'camera issue'
      );

    }

  }


  /* =====================================================
     FILTER SYNC
     ===================================================== */

  function syncFilter(
    filter
  ) {

    if (!connected) {
      return;
    }

    send({
      type: 'filter',
      filter
    });

  }


  /* =====================================================
     CAPTURE
     ===================================================== */

  async function captureLocally(
    tellPartner = true
  ) {

    if (captureInProgress) {
      return;
    }


    if (
      !connected ||
      !connection?.open
    ) {

      return;
    }


    captureInProgress =
      true;


    try {

      if (tellPartner) {

        const sent =
          send({
            type: 'capture'
          });

        if (!sent) {
          return;
        }

      }


      if (
        window.CameraBooth &&
        typeof window.CameraBooth.captureNow ===
        'function'
      ) {

        await window.CameraBooth.captureNow();

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


      if (
        isHost &&
        partnerPhoto
      ) {

        createCombinedPhoto(
          myPhoto,
          partnerPhoto
        );

      }


    } catch (error) {

      console.warn(
        'Co-op capture failed:',
        error
      );

    } finally {

      setTimeout(
        () => {
          captureInProgress =
            false;
        },
        900
      );

    }

  }


  /* =====================================================
     COMBINED PHOTO
     ===================================================== */

  function loadImage(
    source
  ) {

    return new Promise(
      (resolve, reject) => {

        const img =
          new Image();

        img.onload =
          () => resolve(img);

        img.onerror =
          () =>
            reject(
              new Error(
                'Image failed to load'
              )
            );

        img.src =
          source;

      }
    );

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

    let sourceX =
      0;

    let sourceY =
      0;


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


  async function createCombinedPhoto(
    firstSource,
    secondSource
  ) {

    try {

      const first =
        await loadImage(
          firstSource
        );

      const second =
        await loadImage(
          secondSource
        );


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


      const width =
        1400;

      const height =
        900;

      const padding =
        30;

      const header =
        85;

      const footer =
        50;

      const photoWidth =
        (
          width -
          padding * 3
        ) / 2;

      const photoHeight =
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
        photoWidth,
        photoHeight
      );


      drawCover(
        ctx,
        second,
        padding * 2 +
          photoWidth,
        header,
        photoWidth,
        photoHeight
      );


      ctx.fillStyle =
        '#a85d69';

      ctx.font =
        'italic 21px Georgia';

      ctx.fillText(
        'made in our little photo booth',
        width / 2,
        height - 20
      );


      const result =
        canvas.toDataURL(
          'image/jpeg',
          0.94
        );


      window.CameraBooth?.showResult?.(
        result
      );

      window.CameraBooth?.setLastPhoto?.(
        result
      );


      const link =
        document.createElement(
          'a'
        );

      link.href =
        result;

      link.download =
        'satviki-co-op-photo.jpg';

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();


      partnerPhoto =
        null;


    } catch (error) {

      console.warn(
        'Combined photo creation failed:',
        error
      );

    }

  }


  /* =====================================================
     COPY ROOM CODE
     ===================================================== */

  async function copyRoomCode() {

    const code =
      getRoomCode();

    if (!code) {
      return;
    }


    const button =
      $('copyRoom');


    try {

      await navigator
        .clipboard
        .writeText(code);


      if (button) {

        const oldText =
          button.textContent;

        button.textContent =
          'copied';

        setTimeout(
          () => {
            button.textContent =
              oldText;
          },
          1200
        );

      }


    } catch (_) {

      const input =
        getRoomInput();

      if (input) {

        input.focus();
        input.select();

        try {
          document.execCommand(
            'copy'
          );
        } catch (_) {}

      }

    }

  }


  /* =====================================================
     CAPTURE BUTTON INTEGRATION
     ===================================================== */

  function setupCaptureButton() {

    const button =
      $('captureBtn');

    if (!button) {
      return;
    }


    /*
      We use ONE capturing listener.

      When not connected:
      normal camera.js works normally.

      When connected:
      the normal camera capture is stopped and
      the synchronized co-op capture is used.
    */

    button.addEventListener(
      'click',
      (event) => {

        if (
          connected &&
          connection?.open
        ) {

          event.preventDefault();
          event.stopImmediatePropagation();

          captureLocally(
            isHost
          );

        }

      },
      true
    );

  }


  /* =====================================================
     CLEANUP
     ===================================================== */

  function cleanupConnection() {

    try {

      if (connection) {
        connection.close();
      }

    } catch (_) {}


    try {

      if (call) {
        call.close();
      }

    } catch (_) {}


    try {

      if (localStream) {

        localStream
          .getTracks()
          .forEach(
            (track) => {
              track.stop();
            }
          );

      }

    } catch (_) {}


    try {

      if (peer) {
        peer.destroy();
      }

    } catch (_) {}


    connection =
      null;

    call =
      null;

    peer =
      null;

    localStream =
      null;

    connected =
      false;

    myPhoto =
      null;

    partnerPhoto =
      null;

  }


  /* =====================================================
     INIT
     ===================================================== */

  function init() {

    try {

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
          copyRoomCode
        );


      const input =
        $('roomCode');


      input?.addEventListener(
        'input',
        () => {

          input.value =
            input.value
              .toUpperCase()
              .replace(
                /[^A-Z0-9]/g,
                ''
              )
              .slice(0, 6);

        }
      );


      input?.addEventListener(
        'keydown',
        (event) => {

          if (
            event.key ===
            'Enter'
          ) {

            event.preventDefault();

            joinRoom();

          }

        }
      );


      setupCaptureButton();


      setStatus(
        'offline',
        false
      );


      window.addEventListener(
        'beforeunload',
        cleanupConnection
      );


    } catch (error) {

      /*
        Most important safety rule:
        a co-op failure must NEVER stop
        the rest of the anniversary website.
      */

      console.warn(
        'Co-op initialization failed:',
        error
      );

      setStatus(
        'offline',
        false
      );

    }

  }


  /* =====================================================
     PUBLIC API
     ===================================================== */

  window.CoopBooth = {

    init,

    syncFilter,

    startSynchronizedCapture:
      captureLocally,

    destroy:
      cleanupConnection

  };

})();
