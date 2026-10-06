export default function Alerts({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div className="mb-4">
      {error && <p className="alert-error">{error}</p>}
      {ok && <p className="alert-ok">{ok}</p>}
    </div>
  );
}