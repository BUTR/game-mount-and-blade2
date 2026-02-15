import React, { FC, useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { tooltip, selectors } from "vortex-api";
import { ModOptionsSettingsSection, Placeholder } from "../components";
import { ICollectionFeatureProps } from "../../types";
import { useLocalization } from "../../../localization";
import {
  getGlobalSettingsAsync,
  getSpecialSettings,
  ModOptionsEntry,
  ModOptionsStorage,
  PersistentModOptionsEntry,
  readSettingsContentAsync,
} from "../../../modoptions";
import {
  hasIncludedModOptions,
  IncludedModOptions,
} from "../../../collections";
import { nameof } from "../../../nameof";
import { IStateWithBannerlord } from "../../../types";
import { GAME_ID } from "../../../common";

export type ModOptionsDataPageProps = ICollectionFeatureProps;

export const ModOptionsDataPage: FC<ModOptionsDataPageProps> = (props) => {
  const { collection, onSetCollectionAttribute } = props;

  const { localize: t } = useLocalization();

  const [specialSettings, setSpecialSettings] = useState<ModOptionsStorage>({});
  const [globalSettings, setGlobalSettings] = useState<ModOptionsStorage>({});

  const includedModOptions = useSelector<
    IStateWithBannerlord,
    PersistentModOptionsEntry[]
  >((state) => {
    const collectionMod = selectors.getMod(state, GAME_ID, collection.id);
    if (!collectionMod || !hasIncludedModOptions(collectionMod)) {
      return [];
    }

    return collectionMod.attributes?.collection?.includedModOptions ?? [];
  });

  const toggleEntryAsync = useCallback(
    async (newValue: boolean, entry: ModOptionsEntry) => {
      const newEntries: PersistentModOptionsEntry[] = newValue
        ? [
            ...includedModOptions,
            { ...entry, contentBase64: await readSettingsContentAsync(entry) },
          ]
        : includedModOptions.filter((x) => x.name !== entry.name);
      onSetCollectionAttribute(
        [nameof<IncludedModOptions>("includedModOptions")],
        newEntries,
      );
    },
    [includedModOptions, onSetCollectionAttribute],
  );

  const isToggled = (entry: ModOptionsEntry): boolean => {
    return includedModOptions.some((x) => x.name === entry.name);
  };

  const setSettingsAsync = async (): Promise<void> => {
    setSpecialSettings(getSpecialSettings());
    setGlobalSettings(await getGlobalSettingsAsync());
  };

  useEffect(() => {
    void setSettingsAsync();
  }, []);

  return Object.values(globalSettings).length ? (
    <div style={{ overflow: "auto" }}>
      <h4>{t("Mod Configuration Options")}</h4>
      <p>
        {t(
          "This is a snapshot of the settings that can be included within the collection.",
        )}
      </p>
      <tooltip.Button
        tooltip={""}
        onClick={async () => await setSettingsAsync()}
      >
        {t("Reload")}
      </tooltip.Button>
      <ModOptionsSettingsSection
        title={t("Special Options")}
        settings={specialSettings}
        isToggled={isToggled}
        toggleEntry={toggleEntryAsync}
      />
      <ModOptionsSettingsSection
        title={t("Global Options")}
        settings={globalSettings}
        isToggled={isToggled}
        toggleEntry={toggleEntryAsync}
      />
    </div>
  ) : (
    <Placeholder />
  );
};
