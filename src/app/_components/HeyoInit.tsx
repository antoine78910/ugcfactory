"use client";

import { useEffect } from "react";
import HEYO from "@heyo.so/js";

export default function HeyoInit() {
  useEffect(() => {
    HEYO.init({
      projectId: "69c150e9ace32ad739854923",
    });
  }, []);

  return null;
}

