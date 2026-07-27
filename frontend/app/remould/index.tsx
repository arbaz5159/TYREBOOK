import { TyreClassModule } from "@/src/components/TyreClassModule";

export default function RemouldScreen() {
  return (
    <TyreClassModule
      title="Remould Tyres"
      subtitle="Maal Aaya / Maal Gaya · Bike, Truck, Tractor"
      tyreClass="remould"
      categories={["bike", "truck", "tractor"]}
      testIDPrefix="remould"
    />
  );
}
