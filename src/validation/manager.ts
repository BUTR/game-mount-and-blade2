import { types as vetypes } from "@butr/vortexextensionnative";
import { VortexLoadOrderStorage } from "../types";

export class ValidationManager implements vetypes.IValidationManager {
  static fromVortex = (
    loadOrder: VortexLoadOrderStorage,
  ): ValidationManager => {
    return new ValidationManager((moduleId: string): boolean => {
      const module = loadOrder.find((x) => x.id === moduleId);
      return module !== undefined && module.enabled;
    });
  };
  static fromLibrary = (loadOrder: vetypes.LoadOrder): ValidationManager => {
    return new ValidationManager((moduleId: string): boolean => {
      const module = loadOrder[moduleId];
      return module !== undefined && module.isSelected;
    });
  };

  private _isSelectedImpl: (moduleId: string) => boolean;

  constructor(isSelectedImpl: (moduleId: string) => boolean) {
    this._isSelectedImpl = isSelectedImpl;
  }

  isSelected = (moduleId: string): boolean => this._isSelectedImpl(moduleId);
}
