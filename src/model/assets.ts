import { DocumentAsset } from './types';

export class AssetStore {
  private assets = new Map<string, DocumentAsset>();
  private objectUrls = new Map<string, string>();

  constructor(initialAssets?: DocumentAsset[]) {
    if (initialAssets) {
      for (const asset of initialAssets) {
        this.assets.set(asset.id, asset);
      }
    }
  }

  public addAsset(fileName: string, mimeType: string, data: Uint8Array): { id: string; ref: string } {
    const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'bin';
    const id = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const assetFileName = `${id}.${ext}`;
    const ref = `asset://${assetFileName}`;

    const asset: DocumentAsset = {
      id,
      fileName: assetFileName,
      mimeType,
      data,
    };

    this.assets.set(id, asset);
    return { id, ref };
  }

  public getAsset(refOrId: string): DocumentAsset | undefined {
    const cleanId = this.normalizeRefToId(refOrId);
    return this.assets.get(cleanId);
  }

  public getAssetByFileName(fileName: string): DocumentAsset | undefined {
    for (const asset of this.assets.values()) {
      if (asset.fileName === fileName) {
        return asset;
      }
    }
    return undefined;
  }

  public resolveAssetUrl(refOrId: string): string | undefined {
    const asset = this.getAsset(refOrId);
    if (!asset) return undefined;

    if (this.objectUrls.has(asset.id)) {
      return this.objectUrls.get(asset.id)!;
    }

    if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
      const blob = new Blob([asset.data as unknown as BlobPart], { type: asset.mimeType });
      const url = URL.createObjectURL(blob);
      this.objectUrls.set(asset.id, url);
      return url;
    }

    return undefined;
  }

  public removeAsset(refOrId: string): boolean {
    const asset = this.getAsset(refOrId);
    if (!asset) return false;

    const url = this.objectUrls.get(asset.id);
    if (url && typeof URL !== 'undefined') {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(asset.id);
    }
    return this.assets.delete(asset.id);
  }

  public getAllAssets(): DocumentAsset[] {
    return Array.from(this.assets.values());
  }

  public toBytesMap(): Map<string, Uint8Array> {
    const map = new Map<string, Uint8Array>();
    for (const asset of this.assets.values()) {
      map.set(asset.fileName, asset.data);
    }
    return map;
  }

  public static fromBytesMap(bytesMap: Map<string, Uint8Array>): AssetStore {
    const store = new AssetStore();
    for (const [fileName, data] of bytesMap.entries()) {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      let mimeType = 'application/octet-stream';
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
        mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      }
      const id = fileName.replace(/\.[^/.]+$/, '');
      store.assets.set(id, {
        id,
        fileName,
        mimeType,
        data,
      });
    }
    return store;
  }

  public clear(): void {
    if (typeof URL !== 'undefined') {
      for (const url of this.objectUrls.values()) {
        URL.revokeObjectURL(url);
      }
    }
    this.objectUrls.clear();
    this.assets.clear();
  }

  private normalizeRefToId(refOrId: string): string {
    let clean = refOrId;
    if (clean.startsWith('asset://')) {
      clean = clean.substring('asset://'.length);
    }
    return clean.replace(/\.[^/.]+$/, '');
  }
}
