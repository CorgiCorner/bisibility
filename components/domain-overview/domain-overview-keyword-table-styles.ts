export function keywordTableGrid(readOnly: boolean) {
  return readOnly
    ? "grid-cols-[minmax(180px,1.2fr)_104px_104px_82px_62px_72px_88px_minmax(180px,1fr)_70px]"
    : "grid-cols-[28px_minmax(180px,1.2fr)_104px_104px_82px_62px_72px_88px_minmax(180px,1fr)_70px]";
}
