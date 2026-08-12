import { afterEach, beforeEach, vi } from "vitest";

export type BlobDownloadStub = {
  objectUrls: ReturnType<typeof vi.fn>;
  anchorClicks: ReturnType<typeof vi.fn>;
};

const createObjectUrlSpy = vi.fn((blob: Blob) => `blob:${blob.size}`);
const revokeObjectUrlSpy = vi.fn();
const anchorClickSpy = vi.fn();

let createObjectUrlDescriptor: PropertyDescriptor | undefined;
let revokeObjectUrlDescriptor: PropertyDescriptor | undefined;
let anchorClickSpyRef: ReturnType<typeof vi.spyOn> | undefined;

export function stubBlobDownload(): BlobDownloadStub {
  createObjectUrlSpy.mockClear();
  revokeObjectUrlSpy.mockClear();
  anchorClickSpy.mockClear();

  createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrlSpy,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectUrlSpy,
  });

  anchorClickSpyRef = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(anchorClickSpy);

  return {
    anchorClicks: anchorClickSpy,
    objectUrls: createObjectUrlSpy,
  };
}

afterEach(() => {
  anchorClickSpyRef?.mockRestore();
  anchorClickSpyRef = undefined;

  if (createObjectUrlDescriptor) {
    Object.defineProperty(URL, "createObjectURL", createObjectUrlDescriptor);
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  if (revokeObjectUrlDescriptor) {
    Object.defineProperty(URL, "revokeObjectURL", revokeObjectUrlDescriptor);
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
  createObjectUrlDescriptor = undefined;
  revokeObjectUrlDescriptor = undefined;
});

beforeEach(() => {
  createObjectUrlSpy.mockReset();
  createObjectUrlSpy.mockImplementation((blob: Blob) => `blob:${blob.size}`);
  revokeObjectUrlSpy.mockReset();
  anchorClickSpy.mockReset();
});
