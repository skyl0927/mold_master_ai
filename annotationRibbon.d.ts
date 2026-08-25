export type AnnotationRibbonTabId = 'home' | 'annotate' | 'measure' | 'translate';
export interface AnnotationRibbonTab { id: AnnotationRibbonTabId; labelKo: string }
export interface AnnotationRibbonGroup { id: string; labelKo: string; commands: string[] }
export const ANNOTATION_RIBBON_TABS: readonly AnnotationRibbonTab[];
export const ANNOTATION_RIBBON_GROUPS: Readonly<Record<AnnotationRibbonTabId, AnnotationRibbonGroup[]>>;
export const ANNOTATION_COMMON_GROUPS: readonly AnnotationRibbonGroup[];
