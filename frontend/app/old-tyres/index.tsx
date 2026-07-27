import { TyreClassModule } from "@/src/components/TyreClassModule";

export default function OldTyresScreen() {
  return (
    <TyreClassModule
      title="Old Tyres"
      subtitle="Maal Aaya / Maal Gaya · Car & Truck"
      tyreClass="old"
      categories={["car", "truck"]}
      testIDPrefix="old"
    />
  );
}
