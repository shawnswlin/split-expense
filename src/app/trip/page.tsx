import { Suspense } from "react";
import TripClient from "./TripClient";

export default function TripPage() {
  return (
    <Suspense fallback={<main>載入中...</main>}>
      <TripClient />
    </Suspense>
  );
}
