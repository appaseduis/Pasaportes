// Franja con los colores secundarios del manual de identidad.
export default function BrandStripe() {
  return (
    <div className="flex h-1.5 w-full">
      <span className="flex-1 bg-ok" />
      <span className="flex-1 bg-warn" />
      <span className="flex-1 bg-danger" />
    </div>
  );
}