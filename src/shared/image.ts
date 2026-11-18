export type ImageMediaType = 'image/png' | 'image/jpeg';
/** A picture a tool hands back with its text; `caption` says what it shows when that is not obvious. */
export interface Image { data: Buffer; mediaType: ImageMediaType; caption?: string }
