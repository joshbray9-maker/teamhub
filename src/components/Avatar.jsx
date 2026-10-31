// Player photo, or their number / initial in a circle when there's no photo.
export default function Avatar({ p, url, size = 34 }) {
  return url ? <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{p.num || (p.name || '?')[0]}</span>;
}
