'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../../lib/api';
import { bangkokDateInputValue, todayBangkokDateInputValue } from '../../lib/date';
import { remainingDonationImageSlots, selectDonationUploadFiles } from '../../lib/donationImages';

const MapPicker = dynamic(() => import('../map/MapPicker'), { ssr: false });
const DEFAULT_CENTER = { latitude: 13.7291, longitude: 100.7789 };

export default function DonationForm({
  donation,
  onSubmit,
  submitting,
  submitLabel = 'บันทึก',
  cancelHref = '/',
  onDeleteExistingImage,
}) {
  const initial = useMemo(() => ({
    title: donation?.title || '',
    description: donation?.description || '',
    category: donation?.category || '',
    quantity: donation?.quantity || 1,
    address: donation?.address || '',
    latitude: donation?.latitude ?? null,
    longitude: donation?.longitude ?? null,
    startDate: bangkokDateInputValue(donation?.startDate) || todayBangkokDateInputValue(),
    endDate: bangkokDateInputValue(donation?.endDate),
  }), [donation]);

  const [form, setForm] = useState(initial);
  const [draftPosition, setDraftPosition] = useState(() => ({
    latitude: Number.isFinite(Number(initial.latitude)) ? Number(initial.latitude) : DEFAULT_CENTER.latitude,
    longitude: Number.isFinite(Number(initial.longitude)) ? Number(initial.longitude) : DEFAULT_CENTER.longitude,
  }));
  const [mapOpen, setMapOpen] = useState(false);
  const [draftAccuracy, setDraftAccuracy] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const previewUrlsRef = useRef([]);

  const existingImages = Array.isArray(donation?.images) ? donation.images : [];
  const remainingImageSlots = remainingDonationImageSlots(donation);
  const availableImageSlots = Math.max(0, remainingImageSlots - files.length);
  const hasLocation = form.latitude != null
    && form.longitude != null
    && Number.isFinite(Number(form.latitude))
    && Number.isFinite(Number(form.longitude));

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function openMap() {
    setLocationError('');
    setDraftPosition(hasLocation
      ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
      : DEFAULT_CENTER);
    setDraftAccuracy(locationAccuracy);
    setMapOpen(true);
  }

  function updateDraftPosition(nextPosition) {
    setDraftPosition(nextPosition);
    setDraftAccuracy(null);
    setLocationError('');
  }

  function confirmPosition() {
    if (!Number.isFinite(Number(draftPosition.latitude)) || !Number.isFinite(Number(draftPosition.longitude))) return;
    setForm((current) => ({ ...current, ...draftPosition }));
    setLocationAccuracy(draftAccuracy);
    setLocationError('');
    setMapOpen(false);
  }

  function useCurrentLocation() {
    setLocationError('');
    setDraftAccuracy(null);

    if (!window.isSecureContext) {
      setMapOpen(false);
      setLocationError('การใช้ตำแหน่งปัจจุบันต้องเปิดผ่าน HTTPS หรือ localhost');
      return;
    }
    if (!navigator.geolocation) {
      setMapOpen(false);
      setLocationError('Browser นี้ไม่รองรับการระบุตำแหน่ง');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const current = { latitude: coords.latitude, longitude: coords.longitude };
        setDraftPosition(current);
        setDraftAccuracy(Number.isFinite(Number(coords.accuracy)) ? Math.max(0, Math.round(coords.accuracy)) : null);
        setLocating(false);
        setMapOpen(true);
      },
      () => {
        setLocating(false);
        setDraftAccuracy(null);
        setMapOpen(false);
        setLocationError('ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาอนุญาต Location แล้วลองอีกครั้ง');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }
  function selectFiles(fileList) {
    const slotDonation = { images: [...existingImages, ...files.map((_, index) => ({ id: `selected-${index}` }))] };
    const addedFiles = selectDonationUploadFiles(fileList, slotDonation);
    const addedUrls = addedFiles.map((file) => URL.createObjectURL(file));
    previewUrlsRef.current = [...previewUrlsRef.current, ...addedUrls];
    setFiles((current) => [...current, ...addedFiles]);
    setPreviewUrls((current) => [...current, ...addedUrls]);
  }
  function removeSelectedFile(index) {
    const removedUrl = previewUrlsRef.current[index];
    if (removedUrl) URL.revokeObjectURL(removedUrl);
    previewUrlsRef.current = previewUrlsRef.current.filter((_, fileIndex) => fileIndex !== index);
    setPreviewUrls((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setLocationError('');
    if (!hasLocation) {
      setLocationError('กรุณาเลือกตำแหน่งจุดรับของ');
      return;
    }

    await onSubmit({
      data: {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category.trim(),
        quantity: Number(form.quantity),
        address: form.address.trim() || null,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        startDate: form.startDate,
        endDate: form.endDate,
      },
      files,
    });
  }
  return (
    <>
      <form onSubmit={submit}>
        <section className="card createLocationCard">
          <div className="createSectionHeading">
            <div>
              <span className="createStep">1</span>
              <h3>จุดรับของบริจาค</h3>
            </div>
            <span className={`locationState ${hasLocation ? 'isReady' : ''}`}>
              {hasLocation ? 'เลือกตำแหน่งแล้ว' : 'ยังไม่ได้เลือก'}
            </span>
          </div>

          <div className="field createAddressField">
            <label>ชื่อสถานที่ / รายละเอียดจุดรับ</label>
            <input
              maxLength={500}
              value={form.address}
              onChange={(event) => field('address', event.target.value)}
              placeholder="เช่น อาคาร A หน้าประตูทางเข้า"
            />
          </div>

          {hasLocation && (
            <div className="locationPreviewMap" aria-label="ตัวอย่างตำแหน่งที่เลือก">
              <MapPicker
                value={{ latitude: Number(form.latitude), longitude: Number(form.longitude) }}
                interactive={false}
                preview
              />
              <div className="locationPreviewBadge"><span aria-hidden="true">●</span> ตำแหน่งที่เลือก</div>
            </div>
          )}

          <div className="locationActionGrid">
            <button type="button" className="button locationSelectButton" onClick={openMap}>
              <span aria-hidden="true">⌖</span>
              {hasLocation ? 'เปลี่ยนตำแหน่งบนแผนที่' : 'เลือกตำแหน่งบนแผนที่'}
            </button>
            <button type="button" className="button soft" onClick={useCurrentLocation} disabled={locating}>
              {locating ? 'กำลังหาตำแหน่ง...' : 'ใช้ตำแหน่งปัจจุบัน'}
            </button>
          </div>
          {hasLocation && locationAccuracy != null && locationAccuracy > 60 && (
            <div className="locationAccuracyHint" role="status">
              GPS ±{locationAccuracy} ม. · ตำแหน่งที่ยืนยันอาจคลาดเคลื่อน สามารถเลือกจุดบนแผนที่เองได้
            </div>
          )}
          {locationError && <div className="errorBox locationErrorBox">{locationError}</div>}
        </section>

        <section className="card">
          <div className="createSectionHeading">
            <div><span className="createStep">2</span><h3>รูปของบริจาค</h3></div>
            <span className="locationState">{existingImages.length + files.length} / 5 รูป</span>
          </div>
          {(existingImages.length > 0 || previewUrls.length > 0) && (
            <div className="donationImagePreviewGrid">
              {existingImages.map((image) => (
                <div className="donationImagePreview" key={image.id}>
                  <img src={assetUrl(image.imageUrl)} alt={donation?.title || 'รูปของบริจาค'} />
                  {onDeleteExistingImage && (
                    <button type="button" className="donationImageRemove" onClick={() => onDeleteExistingImage(image.id)}>ลบรูป</button>
                  )}
                  <span className="donationImageSource">รูปในโพสต์</span>
                </div>
              ))}
              {previewUrls.map((url, index) => (
                <div className="donationImagePreview" key={`${files[index]?.name}-${index}`}>
                  <img src={url} alt={`ตัวอย่างรูปใหม่ ${index + 1}`} />
                  <button type="button" className="donationImageRemove" onClick={() => removeSelectedFile(index)}>ลบรูป</button>
                  <span className="donationImageSource">รูปใหม่</span>
                </div>
              ))}
            </div>
          )}

          {availableImageSlots > 0 && (
            <label className="uploadBox uploadBoxClean donationUploadBox">
              <div>
                <span className="uploadSymbol" aria-hidden="true">IMG</span>
                <strong>{files.length ? 'เพิ่มรูปภาพ' : 'เลือกรูปภาพ'}</strong>
                <small>JPEG, PNG หรือ WebP · สูงสุด 5 MB ต่อรูป · เลือกเพิ่มได้อีก {availableImageSlots} รูป</small>
              </div>
              <input
                hidden
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => selectFiles(event.target.files)}
              />
            </label>
          )}
          {availableImageSlots === 0 && <div className="empty donationImageFull">รูปภาพครบ 5 รูปแล้ว</div>}
          {files.length > 0 && <p className="uploadSelectionNote">เลือกเพิ่มใหม่ {files.length} รูป · เหลือพื้นที่ {availableImageSlots} รูป</p>}
        </section>

        <section className="card">
          <div className="createSectionHeading">
            <div><span className="createStep">3</span><h3>รายละเอียดของบริจาค</h3></div>
          </div>
          <div className="formGrid">
            <div className="field full">
              <label>ชื่อสิ่งของ *</label>
              <input required maxLength={120} value={form.title} onChange={(event) => field('title', event.target.value)} placeholder="เช่น เสื้อผ้าสภาพดี" />
            </div>
            <div className="field">
              <label>ประเภท *</label>
              <input required maxLength={60} value={form.category} onChange={(event) => field('category', event.target.value)} placeholder="เช่น เสื้อผ้า" />
            </div>
            <div className="field">
              <label>จำนวน *</label>
              <input required type="number" min="1" step="1" value={form.quantity} onChange={(event) => field('quantity', event.target.value)} />
            </div>
            <div className="field full">
              <label>รายละเอียด</label>
              <textarea rows="4" maxLength={2000} value={form.description} onChange={(event) => field('description', event.target.value)} placeholder="สภาพของ รายละเอียดการรับ หรือข้อมูลเพิ่มเติม" />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="createSectionHeading">
            <div><span className="createStep">4</span><h3>ช่วงเวลาที่เปิดบริจาค</h3></div>
          </div>
          <div className="formGrid">
            <div className="field">
              <label>วันที่เริ่มบริจาค *</label>
              <input required type="date" value={form.startDate} onChange={(event) => field('startDate', event.target.value)} />
            </div>
            <div className="field">
              <label>วันที่สิ้นสุด *</label>
              <input required type="date" min={form.startDate} value={form.endDate} onChange={(event) => field('endDate', event.target.value)} />
            </div>
          </div>
          <p className="donationDateNote">วันที่อ้างอิงเวลาประเทศไทย (Asia/Bangkok)</p>
        </section>

        <div className="formActions createFormActions">
          <Link className="button" href={cancelHref}>ยกเลิก</Link>
          <button className="button primary" disabled={submitting}>{submitting ? 'กำลังบันทึก...' : submitLabel}</button>
        </div>
      </form>

      {mapOpen && (
        <div className="locationPickerOverlay" role="dialog" aria-modal="true" aria-label="เลือกตำแหน่งจุดรับของ">
          <div className="locationPickerTopbar">
            <button type="button" className="locationPickerBack" onClick={() => setMapOpen(false)} aria-label="กลับไปหน้าฟอร์ม">
              <span aria-hidden="true">←</span><span>กลับ</span>
            </button>
            <div><strong>เลือกตำแหน่งจุดรับของ</strong><span>แตะบนแผนที่เพื่อวางหมุด</span></div>
            <button type="button" className="locationPickerGps" onClick={useCurrentLocation} disabled={locating}>{locating ? 'กำลังหา...' : 'ตำแหน่งฉัน'}</button>
          </div>
          <div className="locationPickerMap">
            {draftAccuracy != null && draftAccuracy > 60 && (
              <div className="locationAccuracyNotice" role="status">
                GPS ±{draftAccuracy} ม. · ตำแหน่งอาจคลาดเคลื่อน ลองกดตำแหน่งฉันอีกครั้งหรือแตะเลือกจุดเอง
              </div>
            )}
            <MapPicker value={draftPosition} onChange={updateDraftPosition} />
          </div>
          <div className="locationPickerFooter">
            <button type="button" className="button primary" onClick={confirmPosition}>ยืนยันตำแหน่งนี้</button>
          </div>
        </div>
      )}
    </>
  );
}
