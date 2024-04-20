import { types as vetypes } from '@butr/vortexextensionnative';
import { VortexLoadOrderStorage } from '../types';

export class ValidationManager implements vetypes.IValidationManager {
  static fromVortex = (loadOrder: VortexLoadOrderStorage): ValidationManager => {
    return new ValidationManager((moduleId: string): boolean => {
      try {
        const module = loadOrder.find((x) => x.id === moduleId);
        return !!module && module.enabled;
      } catch {
        return false;
      }
    });
  };
  static fromLibrary = (loadOrder: vetypes.LoadOrder): ValidationManager => {
    return new ValidationManager((moduleId: string): boolean => {
      try {
        const module = loadOrder[moduleId];
        return !!module && module.isSelected;
      } catch {
        return false;
      }
    });
  };

  private _isSelectedImpl: (moduleId: string) => boolean;

  constructor(isSelectedImpl: (moduleId: string) => boolean) {
    this._isSelectedImpl = isSelectedImpl;
  }

  isSelected = (moduleId: string): boolean => this._isSelectedImpl(moduleId);
}
