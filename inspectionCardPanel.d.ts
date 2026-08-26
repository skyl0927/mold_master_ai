export type InspectionCardPanel = 'capture' | 'phenomenon' | 'analysis';

export const INSPECTION_CARD_TABS: ReadonlyArray<Readonly<{
  id: InspectionCardPanel;
  labelKo: string;
}>>;

export function toggleInspectionCardPanel(
  openPanels: Record<string, InspectionCardPanel | undefined>,
  imageId: string,
  panel: InspectionCardPanel
): Record<string, InspectionCardPanel | undefined>;
