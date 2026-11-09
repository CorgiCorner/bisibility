"use client";
import { capacityActionClient } from "@/lib/capacity/action";
import { createOnboardingProject as action } from "./actions";
export const createOnboardingProject = capacityActionClient(action);
