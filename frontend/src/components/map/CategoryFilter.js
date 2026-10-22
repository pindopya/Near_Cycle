'use client';

export default function CategoryFilter({ value, onChange, disabled = false }) {
  return (
    <div className={`mapCategoryFilter${value ? ' hasValue' : ''}${disabled ? ' isDisabled' : ''}`}>
      <span className="mapCategoryFilterLabel" aria-hidden="true">ประเภท</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="ทั้งหมด"
        maxLength={60}
        disabled={disabled}
        aria-label="กรองตามประเภทของบริจาค"
      />
      {value && !disabled && (
        <button type="button" className="mapCategoryClear" onClick={() => onChange('')} aria-label="ล้างตัวกรองประเภท">×</button>
      )}
    </div>
  );
}
