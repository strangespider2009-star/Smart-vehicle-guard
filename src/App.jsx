import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, post, postForm, patch, del } from './api.js';
import { mobilePasskeysSupported, registerPhonePasskey, verifyPhonePasskey } from './passkeys.js';
import { startCamera, stopCamera, enrollFace, verifyFace, hasFace, deleteFace } from './face.js';
import { connectSerial, disconnectSerial, isConnected, serialSupported, enrollFingerprint, verifyFingerprint, deleteFingerprint, setDemoLed, resetDemoLed } from './serial.js';

const NAV = [
  ['overview', 'Overview', '▦'], ['vehicles', 'Vehicles', '▤'],
  ['drivers', 'Drivers', '♙'], ['enroll', 'Enrollment', '◉'],
  ['verify', 'Verification', '◎'], ['history', 'Access history', '◷'],
  ['setup', 'Setup guide', '⚙']
];
function Status({ state, children }) {
  const type = state === 'passed' || state === 'enrolled' || state === 'connected' ? 'ok' :
    state === 'failed' || state === 'disconnected' ? 'error' : 'neutral';
  return <span className={`status ${type}`}><span className="dot" />{children || state}</span>;
}
function Message({ value, kind = 'info' }) { return value ? <div className={`message ${kind}`} role="status">{value}</div> : null; }
function Action({ children, busy, ...props }) { return <button type="button" className="primary" disabled={busy || props.disabled} {...props}>{busy ? 'Working…' : children}</button>; }
function Metric({ icon, number, label }) { return <div className="metric"><span>{icon}</span><strong>{number}</strong><small>{label}</small></div>; }

function Auth({ onAuth }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await post(register ? '/api/auth/register' : '/api/auth/login', { name, email, password });
      onAuth(result.user);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <div className="authWrap"><div className="authIntro"><div className="brandBadge">SG</div><p className="eyebrow">BIOMETRIC DEMONSTRATION PLATFORM</p><h1>SMART<br />DRIVE GUARD<span className="accent">.</span></h1><p>Face identity matching + dedicated fingerprint sensor verification, with a Bluetooth-driven red / green LED demonstration.</p><div className="demoNote">EDUCATIONAL LED DEMO ONLY · NOT VEHICLE CONTROL</div></div><form className="authBox" onSubmit={submit}><span className="eyebrow">OWNER PORTAL</span><h2>{register ? 'Create demo account' : 'Welcome back'}</h2><p className="muted">{register ? 'Set up an owner profile to manage test vehicles and drivers.' : 'Sign in to continue your demonstration.'}</p>{register && <label>Full name<input value={name} onChange={e => setName(e.target.value)} required maxLength="80" autoComplete="name" /></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={register ? 8 : 1} autoComplete={register ? 'new-password' : 'current-password'} /></label><Message value={error} kind="error" /><button disabled={busy} className="primary wide" type="submit">{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button><button type="button" className="linkButton" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Already registered? Sign in' : 'New here? Create demo account'}</button><small className="muted">This project is an educational demonstration, not a secure vehicle-access product.</small></form></div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('overview');
  const [data, setData] = useState({ vehicles: [], drivers: [], events: [] });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [connected, setConnected] = useState(false);
  const [serialLog, setSerialLog] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [faceState, setFaceState] = useState('pending');
  const [fpState, setFpState] = useState('pending');
  const [fingerprintMethod, setFingerprintMethod] = useState('sensor');
  const [licenceFile, setLicenceFile] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [faceFeedback, setFaceFeedback] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [progress, setProgress] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [newVehicleId, setNewVehicleId] = useState('');
  const [licenceExpiry, setLicenceExpiry] = useState('');
  const [slot, setSlot] = useState(1);
  const videoRef = useRef(null);
  const activeCameraRef = useRef(null);
  const selected = data.drivers.find(d => d.id === driverId) || null;
  const vehicle = selected ? data.vehicles.find(v => v.id === selected.vehicleId) : null;
  const faceEnrolled = Boolean(user && selected && hasFace(user.id, selected.id));
  const facePassed = faceState === 'passed';
  const fingerprintPassed = fpState === 'passed';
  const canEvaluate = !!selected && ['passed','failed'].includes(faceState) && ['passed','failed'].includes(fpState) && !busy;
  const selectableSlots = useMemo(() => {
    const used = new Set(data.drivers.map(d => d.fingerprintSlot));
    return Array.from({ length: 127 }, (_, i) => i + 1).filter(s => !used.has(s));
  }, [data.drivers]);
  useEffect(() => {
    if (selectableSlots.length && !selectableSlots.includes(Number(slot))) setSlot(selectableSlots[0]);
  }, [selectableSlots, slot]);

  async function refresh() {
    const next = await api('/api/dashboard');
    setData(next);
    setDriverId(old => next.drivers.some(d => d.id === old) ? old : next.drivers[0]?.id || '');
    setNewVehicleId(old => next.vehicles.some(v => v.id === old) ? old : next.vehicles[0]?.id || '');
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api('/api/me');
        if (!active) return;
        setUser(me.user);
        if (me.user) {
          const next = await api('/api/dashboard');
          if (!active) return;
          setData(next);
          setDriverId(next.drivers[0]?.id || '');
          setNewVehicleId(next.vehicles[0]?.id || '');
        }
      } catch (e) { if (active) setError(e.message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    // Switching between enrollment and verification creates a new <video> element.
    // Always stop the stream attached to the previous element.
    stopCamera(activeCameraRef.current); activeCameraRef.current = null; setCameraOn(false);
  }, [page]);
  useEffect(() => () => { stopCamera(activeCameraRef.current); void disconnectSerial(); }, []);

  async function run(fn, successMessage = '') {
    setError(''); setNotice(''); setBusy('task');
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
    } catch (e) { setError(e.message || 'Something went wrong.'); }
    finally { setBusy(''); }
  }
  function resetEvidence() {
    setFaceState('pending'); setFpState('pending'); setFingerprintMethod('sensor'); setVerificationResult(null); setFaceFeedback(''); setProgress('');
    cameraStop();
    if (isConnected()) void resetDemoLed().catch(() => {});
  }
  function chooseDriver(id) { resetEvidence(); setDriverId(id); }
  function statusLog(message) { setSerialLog(old => [...old.slice(-19), message]); }
  async function connect() {
    await run(async () => {
      await connectSerial({
        onDisconnect: () => setConnected(false),
        onStatus: statusLog
      });
      setConnected(true);
      setNotice('Arduino connected through HC-05, and fingerprint sensor responded.');
    });
  }
  async function disconnect() {
    await run(async () => { await disconnectSerial(); setConnected(false); }, 'Bluetooth serial disconnected.');
  }
  async function cameraStart() {
    await run(async () => {
      await startCamera(videoRef.current); activeCameraRef.current = videoRef.current; setCameraOn(true);
    }, 'Camera ready. Keep exactly one consenting person in view.');
  }
  function cameraStop() { stopCamera(activeCameraRef.current || videoRef.current); activeCameraRef.current = null; setCameraOn(false); }
  async function failLed() {
    if (isConnected()) {
      try { await setDemoLed(false); } catch (e) { statusLog(`LED update failed: ${e.message}`); }
    }
  }
  async function saveFace() {
    if (!selected) return setError('Choose a driver.');
    await run(async () => {
      setProgress('Capturing face samples…');
      await enrollFace(videoRef.current, user.id, selected.id, (i, n) => setProgress(`Capturing face sample ${i}/${n}`));
      setFaceState('pending'); setVerificationResult(null);
      setNotice(`Face enrolled for ${selected.name} in this browser only.`);
    });
    setProgress('');
    cameraStop();
  }
  async function matchFace() {
    if (!selected) return setError('Choose a driver.');
    await run(async () => {
      setFaceState('checking'); setProgress('Checking face identity…');
      let result;
      try {
        result = await verifyFace(videoRef.current, user.id, selected.id, (i, n) => setProgress(`Comparing sample ${i}/${n}`));
      } catch (e) { await failLed(); throw e; }
      setFaceState(result.matched ? 'passed' : 'failed');
      setFaceFeedback(`Distance ${result.distance} · required ≤ ${result.threshold}`);
      setVerificationResult(null);
      if (!result.matched) { await failLed(); setError('FACE MISMATCH — This does not match the enrolled driver. Red LED sent.'); }
      else setNotice(`Face matched the enrolled template for ${selected.name}.`);
    });
    setProgress(''); cameraStop();
    // Any camera or model error must be a failure, never a passing result.
    setFaceState(current => current === 'checking' ? 'failed' : current);
  }
  async function saveFingerprint() {
    if (!selected) return setError('Choose a driver first.');
    if (!connected) return setError('Connect HC-05 first.');
    if (!window.confirm(`Enrol a consenting user's fingerprint in sensor slot ${selected.fingerprintSlot}? This overwrites that slot if it already contains a print.`)) return;
    await run(async () => {
      setProgress('Place finger, remove when prompted, then place same finger again. Watch sensor LED.');
      await enrollFingerprint(selected.fingerprintSlot);
      await patch(`/api/drivers/${selected.id}/fingerprint`, { enrolled: true });
      await refresh(); setFpState('pending'); setVerificationResult(null);
      setNotice(`Fingerprint enrolled in the sensor's memory at slot ${selected.fingerprintSlot}.`);
    });
    setProgress('');
  }
  async function checkFingerprint() {
    if (!selected) return setError('Choose a driver first.');
    if (!connected) return setError('Connect HC-05 first.');
    await run(async () => {
      setFpState('checking'); setProgress('Place the enrolled finger on the sensor…');
      await verifyFingerprint(selected.fingerprintSlot);
      setFpState('passed'); setFingerprintMethod('sensor'); setVerificationResult(null);
      setNotice(`Fingerprint matched sensor slot ${selected.fingerprintSlot}.`);
    });
    setProgress(''); setFpState(current => current === 'checking' ? 'failed' : current);
  }
  async function registerMobileDevice() {
    if (!selected) return setError('Choose a driver first.');
    await run(async () => {
      await registerPhonePasskey(selected.id);
      await refresh();
      setFpState('pending'); setFingerprintMethod('mobile'); setVerificationResult(null);
      setNotice('Phone passkey enrolled for this demo driver. The phone may use fingerprint, face, or PIN.');
    });
  }
  async function verifyMobileDevice() {
    if (!selected) return setError('Choose a driver first.');
    await run(async () => {
      setFpState('checking'); setProgress('Confirm identity with your phone passkey…');
      try {
        await verifyPhonePasskey(selected.id);
        setFingerprintMethod('mobile'); setFpState('passed'); setVerificationResult(null);
        setNotice('Phone user verification succeeded (fingerprint, face, or PIN according to device settings).');
      } catch (error) {
        setFingerprintMethod('mobile'); setFpState('failed'); await failLed();
        throw error;
      }
    });
    setProgress(''); setFpState(current => current === 'checking' ? 'failed' : current);
  }
  async function removeFingerprint() {
    if (!selected || !connected) return setError('Select a driver and connect HC-05 first.');
    if (!window.confirm(`Delete fingerprint slot ${selected.fingerprintSlot} from the physical sensor?`)) return;
    await run(async () => {
      await deleteFingerprint(selected.fingerprintSlot);
      await patch(`/api/drivers/${selected.id}/fingerprint`, { enrolled: false });
      await refresh(); setFpState('pending'); setVerificationResult(null);
    }, 'Fingerprint template deleted from the physical sensor.');
  }
  async function evaluate() {
    if (!selected) return setError('Select a driver.');
    await run(async () => {
      const response = await post('/api/access/check', { driverId: selected.id, vehicleId: selected.vehicleId, faceMatched: facePassed, fingerprintMatched: fingerprintPassed, fingerprintMethod });
      setVerificationResult(response.decision);
      await refresh();
      if (connected) {
        try { await setDemoLed(response.decision.accessGranted); }
        catch (e) { throw new Error(`Access decision recorded, but LED transmission failed: ${e.message}`); }
      }
      setNotice((response.decision.accessGranted ? 'DEMO APPROVED' : 'DEMO REJECTED') + (connected ? ' · LED result sent' : ' · connect HC-05 on a supported device to send the LED signal'));
    });
  }
  async function logout() {
    await run(async () => {
      cameraStop(); await disconnectSerial(); await post('/api/auth/logout', {});
      setUser(null); setData({ vehicles: [], drivers: [], events: [] }); setPage('overview');
    });
  }
  if (loading) return <div className="loading">Loading SMART DRIVE GUARD…</div>;
  if (!user) return <Auth onAuth={u => { setUser(u); void refresh().catch(e => setError(e.message)); }} />;

  return <div className="shell">
    <aside className="sidebar">
      <div className="logoLine"><div className="logo">SG</div><div><b>SMART DRIVE</b><small>GUARD / DEMO</small></div></div>
      <div className="navLabel">WORKSPACE</div>
      <nav>{NAV.map(([id, title, symbol]) => <button key={id} type="button" disabled={!!busy} className={page === id ? 'nav active' : 'nav'} onClick={() => { setPage(id); setError(''); setNotice(''); }}><span>{symbol}</span>{title}</button>)}</nav>
      <div className="sidebarFooter"><div className="hardwareLine"><span className={`tinyLight ${connected ? 'green' : 'red'}`} /> HC-05: {connected ? 'CONNECTED' : 'OFFLINE'}</div><div className="noticeSmall">LED-only exhibition prototype. No real vehicle controls.</div><button className="sidebarSignout" type="button" onClick={logout}>↪ Sign out</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">SMART DRIVE GUARD V2</span><h1>{NAV.find(x => x[0] === page)?.[1]}</h1></div><div className="topRight"><span className="demoPill">CLASSROOM DEMO</span><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span></div></header>
      <Message value={error} kind="error" /><Message value={notice} kind="success" />
      {page === 'overview' && <>
        <section className="hero"><div><span className="eyebrow">SECURE ACCESS · EDUCATIONAL PROTOTYPE</span><h2>Two-stage biometric demonstration</h2><p>Compare an enrolled person's face, then verify a fingerprint stored inside a physical sensor. Show final approved / rejected results on two LEDs.</p><button className="primary" type="button" onClick={() => setPage('verify')}>Open verification ↗</button></div><div className="heroArt"><div className="ring ring1"/><div className="ring ring2"/><div className="ring ring3"/><span>◎</span></div></section>
        <div className="metrics"><Metric icon="▤" number={data.vehicles.length} label="Vehicles" /><Metric icon="♙" number={data.drivers.length} label="Drivers" /><Metric icon="◉" number={data.drivers.filter(d => d.fingerprintEnrolled).length} label="Sensor enrollments" /><Metric icon="◷" number={data.events.length} label="Recent checks" /></div>
        <section className="panel"><h3>How the demonstration works</h3><div className="stepsGrid"><div><b>01 · Driver record</b><p>Create a vehicle and a driver with a dedicated fingerprint slot.</p></div><div><b>02 · Enrolment</b><p>Enrol face in this browser and fingerprint inside the sensor.</p></div><div><b>03 · Verification</b><p>Verify face + fingerprint; require approval and a valid demo licence date.</p></div><div><b>04 · LED result</b><p>Send PASS to light green, or FAIL to light red over HC-05.</p></div></div></section>
      </>}
      {page === 'vehicles' && <div className="gridTwo"><section className="panel"><h3>Add vehicle</h3><p className="muted">Use demonstration data only.</p><form onSubmit={e => { e.preventDefault(); void run(async () => { await post('/api/vehicles', { name: vehicleName, plate }); await refresh(); setVehicleName(''); setPlate(''); }, 'Vehicle added.'); }}><label>Vehicle name<input value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="Project demo car" required maxLength="100" /></label><label>Registration label (optional)<input value={plate} onChange={e => setPlate(e.target.value)} placeholder="DEMO-001" maxLength="32" /></label><button className="primary" type="submit" disabled={!!busy}>Save vehicle</button></form></section><section className="panel"><h3>Your vehicles</h3>{!data.vehicles.length && <p className="muted">No vehicles yet.</p>}{data.vehicles.map(v => <div className="entry" key={v.id}><div><b>{v.name}</b><small>{v.plate || 'No label'}</small></div><button className="subtle" type="button" disabled={!!busy} onClick={() => void run(async () => { await del(`/api/vehicles/${v.id}`); await refresh(); }, 'Vehicle removed.')}>Remove</button></div>)}</section></div>}
      {page === 'drivers' && <div className="gridTwo"><section className="panel"><h3>Add authorized test driver</h3><p className="muted">Each driver gets a unique storage slot on a single physical fingerprint sensor (1–127).</p><form onSubmit={e => { e.preventDefault(); void run(async () => { const form = new FormData(); form.set('name', driverName); form.set('vehicleId', newVehicleId); form.set('licenceExpiry', licenceExpiry); form.set('fingerprintSlot', String(slot)); if (licenceFile) form.set('licence', licenceFile); await postForm('/api/drivers', form); await refresh(); setDriverName(''); setLicenceFile(null); }, 'Driver record added.'); }}><label>Name<input required value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Demo driver" maxLength="100" /></label><label>Assigned vehicle<select required value={newVehicleId} onChange={e => setNewVehicleId(e.target.value)}><option value="">Select a vehicle</option>{data.vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Test licence expiry<input required type="date" value={licenceExpiry} onChange={e => setLicenceExpiry(e.target.value)} /></label><label>Driving licence (optional demo PDF, JPG or PNG, max 2 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e => setLicenceFile(e.target.files?.[0] || null)} /></label><label>Fingerprint sensor slot<select value={slot} onChange={e => setSlot(Number(e.target.value))}>{selectableSlots.map(s => <option key={s} value={s}>{s}</option>)}</select></label><button disabled={!!busy || !data.vehicles.length || !selectableSlots.length} className="primary" type="submit">Add driver</button></form></section><section className="panel"><h3>Driver approvals</h3>{!data.drivers.length && <p className="muted">Add a vehicle, then a driver.</p>}{data.drivers.map(d => <div className="driverCard" key={d.id}><div className="entry"><div><b>{d.name}</b><small>Sensor slot {d.fingerprintSlot} · Expiry {d.licenceExpiry}</small></div><Status state={d.approved ? 'passed' : 'pending'}>{d.approved ? 'APPROVED' : 'PENDING'}</Status></div><small className="muted">Fingerprint: {d.fingerprintEnrolled ? 'enrolled in sensor' : 'not enrolled'} · Phone passkey: {d.mobilePasskeyEnrolled ? 'registered' : 'not registered'} · Driving licence: {d.hasLicence ? 'uploaded' : 'not uploaded'}</small>{d.hasLicence && <p><a href={`/api/drivers/${encodeURIComponent(d.id)}/licence`} className="linkButton">Download uploaded demo licence</a></p>}<div className="inlineActions"><button type="button" className="secondary" disabled={!!busy} onClick={() => void run(async () => { await patch(`/api/drivers/${d.id}/approval`, { approved: !d.approved }); await refresh(); }, d.approved ? 'Driver approval removed.' : 'Driver approved.')}>{d.approved ? 'Revoke approval' : 'Approve driver'}</button><button type="button" className="subtle" disabled={!!busy} onClick={() => { if (!window.confirm('Remove the driver record? Delete the hardware sensor fingerprint first from Enrollment.')) return; void run(async () => { await del(`/api/drivers/${d.id}`); if (user) deleteFace(user.id, d.id); await refresh(); resetEvidence(); }, 'Driver removed (sensor slot not deleted).'); }}>Remove record</button></div></div>)}</section></div>}
      {(page === 'enroll' || page === 'verify') && <>
        <section className="panel controlsPanel"><div><h3>Device setup</h3><p className="muted">Pair HC-05 in the computer's Bluetooth settings, then choose its outgoing COM port in desktop Chrome / Edge.</p></div><div className="inlineActions"><Status state={connected ? 'connected' : 'disconnected'}>{connected ? 'HC-05 connected' : 'HC-05 disconnected'}</Status>{connected ? <button className="secondary" disabled={!!busy} onClick={disconnect}>Disconnect</button> : <Action busy={!!busy} onClick={connect} disabled={!serialSupported()}>Connect HC-05</Action>}</div></section>
        {!serialSupported() && <Message kind="error" value="HC-05 requires a compatible serial browser/device. You can still register and verify a phone passkey here; real optical fingerprints require the external sensor." />}
        <section className="panel driverSelector"><label>Selected driver<select value={driverId} disabled={!!busy} onChange={e => chooseDriver(e.target.value)}><option value="">Select driver</option>{data.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><div><small>Assigned vehicle</small><b>{vehicle?.name || 'None'}</b></div><div><small>Sensor slot</small><b>{selected?.fingerprintSlot ?? '—'}</b></div><div><small>Owner status</small><Status state={selected?.approved ? 'passed' : 'pending'}>{selected?.approved ? 'Approved' : 'Not approved'}</Status></div></section>
        {!data.drivers.length && <Message value="Create a vehicle and a driver first, then enrol biometrics." />}
        <div className="gridTwo verificationGrid"><section className="panel"><div className="sectionHead"><div><span className="stepNumber">01</span><h3>Facial identity match</h3></div><Status state={faceState}>{faceState === 'passed' ? 'MATCH' : faceState === 'failed' ? 'NO MATCH' : faceState === 'checking' ? 'CHECKING' : 'PENDING'}</Status></div><p className="muted">Compares a real 128-number face descriptor against this driver's locally enrolled template. A different face should be rejected; this is not liveness detection.</p><video className="video" ref={videoRef} autoPlay muted playsInline style={{ display: cameraOn ? 'block' : 'none' }} /><div className={cameraOn ? 'cameraHint hidden' : 'cameraHint'}>▣<span>Camera preview not active</span></div><small className="muted">Local face template: {faceEnrolled ? 'ENROLLED' : 'NOT ENROLLED'}</small><div className="inlineActions"><button type="button" className="secondary" disabled={!!busy || cameraOn || !selected} onClick={cameraStart}>Start camera</button><button type="button" className="subtle" disabled={!!busy || !cameraOn} onClick={cameraStop}>Stop camera</button></div><div className="inlineActions">{page === 'enroll' ? <><Action busy={!!busy} disabled={!cameraOn || !selected} onClick={saveFace}>Enrol face</Action><button className="subtle danger" type="button" disabled={!!busy || !faceEnrolled} onClick={() => { deleteFace(user.id, selected.id); resetEvidence(); setNotice('Local face template deleted.'); }}>Delete face</button></> : <Action busy={!!busy} disabled={!cameraOn || !selected || !faceEnrolled} onClick={matchFace}>Verify face</Action>}</div>{faceFeedback && <p className="codeText">{faceFeedback}</p>}</section>
        <section className="panel"><div className="sectionHead"><div><span className="stepNumber">02</span><h3>Optical fingerprint sensor</h3></div><Status state={fpState}>{fpState === 'passed' ? 'MATCH' : fpState === 'failed' ? 'NO MATCH' : fpState === 'checking' ? 'CHECKING' : 'PENDING'}</Status></div><p className="muted">Genuine fingerprint enrollment and matching occur on the R307/AS608 sensor via Arduino. No raw fingerprint is sent to the website.</p><div className="fingerIcon">◉</div><div className="statLine"><span>Assigned slot</span><b>{selected?.fingerprintSlot ?? '—'}</b></div><div className="statLine"><span>Enrolment</span><Status state={selected?.fingerprintEnrolled ? 'enrolled' : 'pending'}>{selected?.fingerprintEnrolled ? 'ENROLLED' : 'NOT ENROLLED'}</Status></div>{page === 'enroll' ? <div className="inlineActions"><Action busy={!!busy} disabled={!connected || !selected} onClick={saveFingerprint}>Enrol fingerprint</Action><button type="button" className="subtle danger" disabled={!!busy || !selected?.fingerprintEnrolled || !connected} onClick={removeFingerprint}>Delete print</button><button type="button" className="secondary" disabled={!!busy || !selected || !mobilePasskeysSupported()} onClick={registerMobileDevice}>Register phone passkey</button></div> : <div className="inlineActions"><Action busy={!!busy} disabled={!connected || !selected?.fingerprintEnrolled} onClick={checkFingerprint}>Verify fingerprint</Action><button className="secondary" type="button" disabled={!!busy || !selected?.mobilePasskeyEnrolled || !mobilePasskeysSupported()} onClick={verifyMobileDevice}>Verify with phone</button></div>}<small className="muted">Fingerprint enrollment requires two captures of the same finger. A nonmatching fingerprint lights the red LED. Phone passkey: {selected?.mobilePasskeyEnrolled ? 'registered' : 'not registered'}; device may use fingerprint, face or PIN. This is not a fingerprint-only or legal identity proof.</small></section></div>
        {progress && <Message value={progress} />}
        {page === 'verify' && <section className="panel resultPanel"><div><h3>Final two-factor demo decision</h3><p className="muted">Green only when both checks pass AND vehicle, expiry date and owner approval are valid. Otherwise red. Phone passkey can be used without HC-05 for the on-screen decision; physical LEDs require HC-05 connection. This is a demonstration, not secure identity proof.</p></div><div className="inlineActions"><Action disabled={!canEvaluate} busy={!!busy} onClick={evaluate}>Evaluate & send LED result</Action><button className="secondary" disabled={!!busy} type="button" onClick={() => { resetEvidence(); setNotice('Verification reset. LEDs off if connected.'); }}>Reset</button></div>{verificationResult && <div className={`decision ${verificationResult.accessGranted ? 'approve' : 'deny'}`}><b>{verificationResult.accessGranted ? '✓ DEMO APPROVED' : '✕ DEMO REJECTED'}</b><div className="checks">{Object.entries(verificationResult.checks).map(([k, val]) => <span key={k}>{val ? '✓' : '✕'} {k.replace(/([A-Z])/g, ' $1')}</span>)}</div></div>}</section>}
        <section className="panel"><h3>Bluetooth messages</h3><pre className="serialConsole">{serialLog.length ? serialLog.join('\n') : 'No serial messages received. Connect HC-05 first.'}</pre></section>
      </>}
      {page === 'history' && <section className="panel"><h3>Last 80 demo checks</h3>{!data.events.length ? <p className="muted">No checks recorded yet.</p> : <div className="historyTable"><table><thead><tr><th>Time</th><th>Driver</th><th>Vehicle</th><th>Face</th><th>Fingerprint</th><th>Decision</th></tr></thead><tbody>{data.events.map(e => <tr key={e.id}><td>{new Date(e.at).toLocaleString()}</td><td>{e.driverName}</td><td>{e.vehicleName}</td><td>{e.faceMatched ? 'Pass' : 'Fail'}</td><td>{e.fingerprintMatched ? 'Pass' : 'Fail'}</td><td><Status state={e.accessGranted ? 'passed' : 'failed'}>{e.accessGranted ? 'APPROVED' : 'DENIED'}</Status></td></tr>)}</tbody></table></div>}</section>}
      {page === 'setup' && <div className="gridTwo"><section className="panel"><h3>Hardware needed</h3><ol className="setupList"><li>Arduino UNO with Arduino IDE.</li><li>HC-05 Bluetooth Classic serial module (paired as a COM port).</li><li>R307 or AS608 compatible UART fingerprint sensor (Adafruit library).</li><li>One red LED, one green LED, two 220 Ω resistors, and safe low-voltage wiring.</li><li>USB cable for uploading firmware.</li></ol><p className="muted">This prototype drives LEDs only. Never wire it to actual vehicle ignition or other safety-critical equipment.</p></section><section className="panel"><h3>Physical setup sequence</h3><ol className="setupList"><li>Upload <code>firmware/SmartDriveGuardDemo/SmartDriveGuardDemo.ino</code> using Arduino IDE.</li><li>Install <code>Adafruit Fingerprint Sensor Library</code>.</li><li>Connect the fingerprint module and HC-05 as described in README.md.</li><li>Pair HC-05 in Windows Bluetooth settings and open the outgoing COM port.</li><li>Click <b>Enrollment</b>, select driver, then enrol face and fingerprint.</li><li>Open <b>Verification</b>, verify both, and evaluate the LED result.</li></ol></section></div>}
      <footer className="footer">SMART DRIVE GUARD · Classroom / exhibition prototype · Consent required for biometric enrollment · LED-only outputs</footer>
    </main>
  </div>;
}
