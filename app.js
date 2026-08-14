(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let peer = null;
  let connection = null;
  let activeCall = null;
  let localStream = null;

  let isHost = false;
  let roomCode = '';
  let remotePeerId = null;

  let myLatestPhoto = null;
  let partnerLatestPhoto = null;

  let isConnecting = false;
  let captureLock = false;

  const PEER_PREFIX = 'satviki-booth-';


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


  function setRemoteVideo(stream) {
    const remoteVideo = $('remoteVideo');
    const placeholder = $('remotePlaceholder');

    if (!remoteVideo) return;

    if (!stream) {
      remoteVideo.srcObject = null;

      if (placeholder) {
        placeholder.hidden = false;
      }

      return;
    }

    remoteVideo.srcObject = stream;

    remoteVideo.muted = true;

    const playPromise =
      remoteVideo.play();

    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }

    if (placeholder) {
      placeholder.hidden = true;
    }
  }


  /* =====================================================
     ROOM CODE
     ===================================================== */

  function normalizeRoomCode(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
  }


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


  function peerIdFromRoom(code) {
    return PEER_PREFIX + code.toLowerCase();
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
        'Camera API is not available in this browser.'
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
     SEND DATA
     ===================================================== */

  function send(data) {

    if (
      connection &&
      connection.open
    ) {
      try {
        connection.send(data);
        return true;
      } catch (error) {
        console.warn(
          'Co-op send failed:',
          error
        );
      }
    }

    return false;
  }


  /* =====================================================
     DATA CHANNEL
     ===================================================== */

  function handleData(data) {

    if (
      !data ||
      typeof data !== 'object'
    ) {
      return;
    }


    /* Guest/host handshake */
    if (data.type === 'hello') {

      send({
        type: 'hello-ack'
      });

      return;
    }


    if (data.type === 'hello-ack') {

      setStatus(
        'connected',
        true
      );

      /* Host tells guest which peer ID is authoritative */
      if (isHost) {
        send({
          type: 'host-ready',
          peerId: peer?.id || null
        });
      }

      return;
    }


    if (data.type === 'host-ready') {

      if (data.peerId) {
        remotePeerId =
          data.peerId;
      }

      return;
    }


    /* Filter synchronization */
    if (data.type === 'filter') {

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


    /* Remote capture request */
    if (data.type === 'capture') {

      takeSynchronizedPhoto(false);

      return;
    }


    /* Partner photo */
    if (data.type === 'photo') {

      partnerLatestPhoto =
        data.data || null;

      if (
        isHost &&
        myLatestPhoto &&
        partnerLatestPhoto
      ) {
        composeCombinedPhoto(
          myLatestPhoto,
          partnerLatestPhoto
        );
      }

      return;
    }
  }


  /* =====================================================
     CONNECTION
     ===================================================== */

  function setupConnection(conn) {

    connection = conn;

    if (!connection) {
      return;
    }


    connection.on(
      'open',
      async () => {

        isConnecting = false;

        setStatus(
          'connected',
          true
        );

        send({
          type: 'hello',
          name: 'Satviki Booth'
        });


        /*
          The data channel is definitely ready now.
          Only after this point do we start the WebRTC
          camera call.
        */

        try {

          if (
            remotePeerId &&
            peer &&
            peer.open
          ) {

            await startVideoCall(
              remotePeerId
            );

          } else if (
            !isHost &&
            peer
          ) {

            /*
              Guest already knows the host Peer ID
              from the room code.
            */

            await startVideoCall(
              peerIdFromRoom(roomCode)
            );
          }

        } catch (error) {

          console.warn(
            'Video call start failed:',
            error
          );

        }
      }
    );


    connection.on(
      'data',
      handleData
    );


    connection.on(
      'close',
      () => {

        setStatus(
          'partner disconnected',
          false
        );

        setRemoteVideo(null);

      }
    );


    connection.on(
      'error',
      (error) => {

        console.error(
          'Data connection error:',
          error
        );

        setStatus(
          'connection error',
          false
        );
      }
    );
  }


  /* =====================================================
     WEBRTC VIDEO CALL
     ===================================================== */

  async function startVideoCall(targetPeerId) {

    if (
      !targetPeerId ||
      !peer
    ) {
      return;
    }

    /*
      Avoid duplicate calls.
    */
    if (
      activeCall &&
      !activeCall.destroyed
    ) {
      return;
    }


    const stream =
      await getLocalStream();


    const call =
      peer.call(
        targetPeerId,
        stream,
        {
          metadata: {
            roomCode,
            type: 'satviki-coop'
          }
        }
      );


    if (!call) {
      throw new Error(
        'PeerJS could not create the video call.'
      );
    }


    activeCall =
      call;


    call.on(
      'stream',
      (remoteStream) => {

        setRemoteVideo(
          remoteStream
        );

        setStatus(
          'together',
          true
        );

      }
    );


    call.on(
      'close',
      () => {

        activeCall = null;

        setRemoteVideo(null);

      }
    );


    call.on(
      'error',
      (error) => {

        console.error(
          'Video call error:',
          error
        );

        activeCall = null;

        setStatus(
          'video connection issue'
        );
      }
    );
  }


  async function answerIncomingCall(call) {

    try {

      const stream =
        await getLocalStream();

      call.answer(stream);

      activeCall =
        call;


      call.on(
        'stream',
        (remoteStream) => {

          setRemoteVideo(
            remoteStream
          );

          setStatus(
            'together',
            true
          );

        }
      );


      call.on(
        'close',
        () => {

          activeCall = null;

          setRemoteVideo(null);

        }
      );


      call.on(
        'error',
        (error) => {

          console.error(
            'Incoming call error:',
            error
          );

          activeCall = null;

          setStatus(
            'video connection issue'
          );

        }
      );

    } catch (error) {

      console.error(
        'Unable to answer camera call:',
        error
      );

      setStatus(
        'camera unavailable'
      );
    }
  }


  /* =====================================================
     CREATE ROOM
     ===================================================== */

  async function createRoom() {

    if (isConnecting) {
      return;
    }

    if (!window.Peer) {

      alert(
        'The co-op booth could not load its connection service. Check your internet connection and reload the page.'
      );

      return;
    }


    isConnecting = true;
    isHost = true;

    roomCode =
      generateRoomCode();

    remotePeerId = null;

    $('roomCode').value =
      roomCode;


    setStatus(
      'creating room...'
    );


    try {

      /*
        Use the room code directly as the
        unique PeerJS ID.
      */

      peer =
        new Peer(
          peerIdFromRoom(roomCode),
          {
            debug: 0
          }
        );


      peer.on(
        'open',
        async (id) => {

          isConnecting = false;

          setStatus(
            'waiting for partner',
            true
          );

          try {

            await getLocalStream();

          } catch (error) {

            console.warn(
              'Host camera unavailable:',
              error
            );

            alert(
              'Please allow camera access for your side of the co-op booth.'
            );
          }
        }
      );


      peer.on(
        'connection',
        (conn) => {

          remotePeerId =
            conn.peer;

          setupConnection(conn);

        }
      );


      peer.on(
        'call',
        (call) => {

          answerIncomingCall(
            call
          );

        }
      );


      peer.on(
        'error',
        (error) => {

          console.error(
            'PeerJS room creation error:',
            error
          );

          isConnecting = false;

          if (
            error.type ===
            'unavailable-id'
          ) {

            setStatus(
              'room already exists'
            );

            alert(
              'That room code was already taken. Please create the room again.'
            );

          } else {

            setStatus(
              'connection error'
            );

            alert(
              'Could not create the room. Please check your internet connection and try again.'
            );
          }

        }
      );


    } catch (error) {

      console.error(
        'Room creation failed:',
        error
      );

      isConnecting = false;

      setStatus(
        'could not create room'
      );

    }
  }


  /* =====================================================
     JOIN ROOM
     ===================================================== */

  async function joinRoom() {

    if (isConnecting) {
      return;
    }

    if (!window.Peer) {

      alert(
        'The co-op booth could not load its connection service. Check your internet connection and reload the page.'
      );

      return;
    }


    roomCode =
      normalizeRoomCode(
        $('roomCode')?.value
      );


    if (!roomCode) {

      alert(
        'Enter the 6-character room code first.'
      );

      $('roomCode')?.focus();

      return;
    }


    if (roomCode.length !== 6) {

      alert(
        'The room code should contain 6 characters.'
      );

      return;
    }


    isConnecting = true;
    isHost = false;

    remotePeerId =
      peerIdFromRoom(roomCode);

    setStatus(
      'connecting...'
    );


    try {

      /*
        Guest receives a completely random PeerJS ID.
        It then connects its data channel to the
        deterministic host ID.
      */

      peer =
        new Peer({
          debug: 0
        });


      peer.on(
        'open',
        async () => {

          try {

            /*
              Ask for the local camera before
              starting the room call.
            */

            await getLocalStream();

          } catch (error) {

            console.warn(
              'Guest camera unavailable:',
              error
            );
          }


          const conn =
            peer.connect(
              peerIdFromRoom(roomCode),
              {
                reliable: true,
                serialization: 'json'
              }
            );


          if (!conn) {

            setStatus(
              'could not connect'
            );

            isConnecting = false;

            return;
          }


          setupConnection(
            conn
          );

        }
      );


      peer.on(
        'call',
        (call) => {

          answerIncomingCall(
            call
          );

        }
      );


      peer.on(
        'error',
        (error) => {

          console.error(
            'PeerJS join error:',
            error
          );

          isConnecting = false;

          if (
            error.type ===
            'peer-unavailable'
          ) {

            setStatus(
              'room not found'
            );

            alert(
              'That room could not be found. Ask the host to create a new room and send you the new code.'
            );

          } else {

            setStatus(
              'join failed'
            );

            alert(
              'Could not join the room. Check the room code and your internet connection.'
            );
          }
        }
      );


    } catch (error) {

      console.error(
        'Join failed:',
        error
      );

      isConnecting = false;

      setStatus(
        'join failed'
      );

    }
  }


  /* =====================================================
     FILTER SYNC
     ===================================================== */

  function syncFilter(filter) {

    send({
      type: 'filter',
      filter
    });

  }


  /* =====================================================
     CO-OP CAPTURE
     ===================================================== */

  async function takeSynchronizedPhoto(
    broadcast = true
  ) {

    if (captureLock) {
      return;
    }

    captureLock = true;


    try {

      /*
        The host starts the capture and tells the guest.
      */

      if (broadcast) {

        const sent =
          send({
            type: 'capture'
          });

        if (!sent) {

          alert(
            'Satviki is not connected yet.'
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


      myLatestPhoto =
        window.CameraBooth?.getLastPhoto?.() ||
        null;


      if (!myLatestPhoto) {
        return;
      }


      send({
        type: 'photo',
        data: myLatestPhoto
      });


      /*
        Host combines both photos once
        the partner photo arrives.
      */

      if (
        isHost &&
        partnerLatestPhoto
      ) {

        composeCombinedPhoto(
          myLatestPhoto,
          partnerLatestPhoto
        );

      }


    } catch (error) {

      console.error(
        'Co-op capture failed:',
        error
      );

    } finally {

      setTimeout(
        () => {
          captureLock = false;
        },
        700
      );

    }
  }


  /* =====================================================
     COMBINED PHOTO
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
                'Image could not be loaded.'
              )
            );

        image.src =
          src;

      }
    );
  }


  async function composeCombinedPhoto(
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


      const canvas =
        document.createElement(
          'canvas'
        );

      canvas.width =
        width;

      canvas.height =
        height;


      const ctx =
        canvas.getContext(
          '2d'
        );


      if (!ctx) {
        return;
      }


      /* Background */

      ctx.fillStyle =
        '#fffaf5';

      ctx.fillRect(
        0,
        0,
        width,
        height
      );


      /* Header */

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


      /* Draw photos */

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


      /* Footer */

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


      /* Download automatically */

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


      partnerLatestPhoto = null;


    } catch (error) {

      console.error(
        'Could not create combined photo:',
        error
      );

      alert(
        'The two photos connected, but the combined photo could not be created.'
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

    const imageRatio =
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
      imageRatio >
      targetRatio
    ) {

      sourceWidth =
        image.height *
        targetRatio;

      sourceX =
        (image.width -
          sourceWidth) /
        2;

    } else {

      sourceHeight =
        image.width /
        targetRatio;

      sourceY =
        (image.height -
          sourceHeight) /
        2;
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
     COPY ROOM CODE
     ===================================================== */

  async function copyRoomCode() {

    const field =
      $('roomCode');

    const button =
      $('copyRoom');

    const value =
      normalizeRoomCode(
        field?.value
      );

    if (!value) {
      return;
    }


    try {

      await navigator
        .clipboard
        .writeText(value);

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
        field.select();
      }

      try {
        document.execCommand(
          'copy'
        );
      } catch (_) {}

    }
  }


  /* =====================================================
     CLEANUP
     ===================================================== */

  function destroy() {

    try {

      if (connection) {

        connection.close();

        connection = null;

      }

    } catch (_) {}


    try {

      if (activeCall) {

        activeCall.close();

        activeCall = null;

      }

    } catch (_) {}


    try {

      if (localStream) {

        localStream
          .getTracks()
          .forEach(
            track => track.stop()
          );

        localStream = null;

      }

    } catch (_) {}


    try {

      if (peer) {

        peer.destroy();

        peer = null;

      }

    } catch (_) {}


    setRemoteVideo(
      null
    );

    setStatus(
      'offline',
      false
    );

    isHost = false;
    roomCode = '';
    remotePeerId = null;

  }


  /* =====================================================
     INIT
     ===================================================== */

  function init() {

    const create =
      $('createRoom');

    const join =
      $('joinRoom');

    const copy =
      $('copyRoom');

    if (create) {

      create.addEventListener(
        'click',
        createRoom
      );

    }

    if (join) {

      join.addEventListener(
        'click',
        joinRoom
      );

    }

    if (copy) {

      copy.addEventListener(
        'click',
        copyRoomCode
      );

    }


    const roomField =
      $('roomCode');

    if (roomField) {

      roomField.addEventListener(
        'input',
        () => {

          roomField.value =
            normalizeRoomCode(
              roomField.value
            );

        }
      );


      roomField.addEventListener(
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

    }


    /*
      The normal camera capture button already
      captures locally. In co-op mode, replace
      its action only when a connection exists.
    */

    const capture =
      $('captureBtn');

    if (capture) {

      capture.addEventListener(
        'click',
        () => {

          if (
            connection &&
            connection.open
          ) {

            /*
              Capture via the co-op workflow.
              Prevent the normal camera capture
              from being triggered twice by relying
              on this listener only when connected.
            */

            takeSynchronizedPhoto(
              isHost
            );

          }

        },
        true
      );

    }


    window.addEventListener(
      'beforeunload',
      destroy
    );


    setStatus(
      'offline',
      false
    );

  }


  /* =====================================================
     PUBLIC API
     ===================================================== */

  window.CoopBooth = {

    init,
    syncFilter,

    startSynchronizedCapture:
      takeSynchronizedPhoto,

    destroy
  };

})();
