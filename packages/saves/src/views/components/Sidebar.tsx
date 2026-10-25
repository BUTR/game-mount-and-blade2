import React, { FC } from "react";
import { Icon } from "@nexusmods/vortex-api";
import { ActionButton } from "@bannerlord/ui/components/Controls";
import { BannerImage } from "@bannerlord/ui/components/BannerImage";
import { ISaveGame } from "../types";
import { countIssues, formatSaveTime } from "../utils";
import { useLocalization } from "@bannerlord/core/localization/hooks";
import { versionToString } from "@bannerlord/core/butr/version";
import { useSaveDetails } from "../../details";
import { ISaveDetails, Season } from "../../saveFile";

type Localize = (key: string, values?: Record<string, string>) => string;

export type SidebarProps = {
  save: ISaveGame | null;
  /**
   * The save the game is started into, null for none
   */
  launchSave: ISaveGame | null;
  /**
   * Without BLSE the game can't be started into a save
   */
  hasBLSE: boolean;
  onLaunchSave: (save: ISaveGame | null) => Promise<void>;
  saveLoadOrder: SaveLoadOrderActions;
};

/**
 * Setting up the mods a save was made with: in the current profile, or a profile of its own
 */
export type SaveLoadOrderActions = {
  /**
   * Whether the current profile's load order turns on exactly the save's modules, in its order
   */
  matches: (save: ISaveGame) => boolean;
  /**
   * While one of the actions runs
   */
  busy: boolean;
  onUse: (save: ISaveGame) => Promise<void>;
  onCreateProfile: (save: ISaveGame) => Promise<void>;
};

const formatNumber = (value: number | undefined): string | null =>
  value !== undefined ? Math.floor(value).toLocaleString() : null;

const Stat: FC<{ label: string; value: string | null }> = ({
  label,
  value,
}) => (
  <div className="bls-stat">
    <span className="bls-title-xs">{label}</span>
    <span className="bls-stat-value">{value ?? "—"}</span>
  </div>
);

/**
 * The game's own headings end with a colon, from the "{HEADING}:{NL}{LIST}" messages they come from
 */
const trimHeading = (heading: string): string => heading.replace(/[:\s]+$/, "");

const IssueGroups: FC<{ save: ISaveGame; t: Localize }> = ({ save, t }) => {
  const groups = [
    {
      heading: t("{=HvvA78sZ}Load Order Issues:{NL}{LOADORDERISSUES}", {
        NL: "",
        LOADORDERISSUES: "",
      }),
      issues: save.loadOrderIssues,
    },
    {
      heading: t("{=GtDRbC3m}Missing Modules:{NL}{MODULES}", {
        NL: "",
        MODULES: "",
      }),
      issues: save.missingModules,
    },
    {
      heading: t("{=vCwH9226}Duplicate Module Names:{NL}{MODULENAMES}", {
        NL: "",
        MODULENAMES: "",
      }),
      issues: save.duplicateModules,
    },
    {
      heading: t("{=BuMom4Jt}Mismatched Module Versions:{NL}{MODULEVERSIONS}", {
        NL: "",
        MODULEVERSIONS: "",
      }),
      issues: save.mismatchedModuleVersions,
    },
  ].filter((group) => group.issues !== undefined && group.issues.length > 0);

  if (groups.length === 0) {
    return (
      <p className="bls-ok-note">
        <Icon name="toggle-enabled" className="bls-ok" />
        {t("Matches the mods you have installed.")}
      </p>
    );
  }

  return (
    <div className="bls-alert bls-small" role="status">
      {groups.map((group) => (
        <div key={group.heading} className="bls-issue-group">
          <span className="bls-alert-heading">
            <Icon name="feedback-warning" />
            {trimHeading(group.heading)}
          </span>
          <ul>
            {group.issues!.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

const LaunchSection: FC<{
  save: ISaveGame;
  launchSave: ISaveGame | null;
  onLaunchSave: (save: ISaveGame | null) => Promise<void>;
  t: Localize;
}> = ({ save, launchSave, onLaunchSave, t }) => {
  const isLaunchSave = save.name === launchSave?.name;
  if (isLaunchSave) {
    return (
      <section className="bls-details-section bls-small">
        <p className="bls-ok-note">
          <Icon name="toggle-enabled" className="bls-ok" />
          {t("The game loads this save when you launch it from Vortex.")}
        </p>
        <ActionButton
          variant="subdued"
          block
          onClick={() => void onLaunchSave(null)}
        >
          {t("Don't Load a Save")}
        </ActionButton>
      </section>
    );
  }
  return (
    <section className="bls-details-section bls-small">
      <ActionButton
        variant="primary"
        large
        block
        icon="launch-application"
        onClick={() => void onLaunchSave(save)}
      >
        {t("Load on Launch")}
      </ActionButton>
      <p className="bls-muted">
        {countIssues(save) > 0
          ? t(
              "The game starts straight into this save. Fix the issues below first, " +
                "or the game may refuse to load it.",
            )
          : t("The game starts straight into this save, skipping the menu.")}
      </p>
    </section>
  );
};

const LoadOrderSection: FC<{
  save: ISaveGame;
  actions: SaveLoadOrderActions;
  t: Localize;
}> = ({ save, actions, t }) => {
  const matches = actions.matches(save);
  const incomplete =
    (save.missingModules?.length ?? 0) > 0 ||
    (save.mismatchedModuleVersions?.length ?? 0) > 0;
  return (
    <section className="bls-details-section bls-small">
      <h3 className="bls-title-xs">{t("Load Order")}</h3>
      {incomplete && (
        <div className="bls-alert bls-small" role="status">
          <span className="bls-alert-heading">
            <Icon name="feedback-warning" />
            {t("Not every mod is available as the save was made with it")}
          </span>
          <span>
            {t(
              "Some are missing or in other versions, see Compatibility above. The save's load order can still be " +
                "used, but the game may refuse to load the save, or it may break.",
            )}
          </span>
        </div>
      )}
      {matches ? (
        <p className="bls-ok-note">
          <Icon name="toggle-enabled" className="bls-ok" />
          {t("Your load order is the one this save was made with.")}
        </p>
      ) : (
        <p className="bls-muted">
          {t(
            "Your load order differs from the one this save was made with. Use the save's here, " +
              "or keep your profile as it is and give the save a profile of its own.",
          )}
        </p>
      )}
      <ActionButton
        variant="subdued"
        block
        icon={actions.busy ? "spinner" : "sort-none"}
        disabled={actions.busy || matches}
        title={
          matches
            ? t("Your load order is the one this save was made with")
            : undefined
        }
        onClick={() => void actions.onUse(save)}
      >
        {t("Use This Save's Load Order")}
      </ActionButton>
      <ActionButton
        variant="subdued"
        block
        icon={actions.busy ? "spinner" : "add"}
        disabled={actions.busy}
        onClick={() => void actions.onCreateProfile(save)}
      >
        {t("Create Profile for This Save")}
      </ActionButton>
    </section>
  );
};

const SEASON_NAMES: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

const formatDate = (
  date: NonNullable<ISaveDetails["date"]>,
  t: Localize,
): string =>
  t("{{season}} {{day}}, {{year}}", {
    season: t(SEASON_NAMES[date.season]),
    day: `${date.day}`,
    year: `${date.year}`,
  });

const formatKingdom = (
  kingdom: NonNullable<ISaveDetails["kingdom"]> | null,
  t: Localize,
): string => {
  if (kingdom === null) {
    return t("Independent");
  }
  switch (kingdom.status) {
    case "ruler":
      return t("Ruler of {{kingdom}}", { kingdom: kingdom.name });
    case "mercenary":
      return t("Mercenary for {{kingdom}}", { kingdom: kingdom.name });
    default:
      return t("Vassal of {{kingdom}}", { kingdom: kingdom.name });
  }
};

/**
 * The campaign as the save has it, read from the save itself, its numbers are with the stats above. Rows it couldn't
 * read are left out
 */
const CampaignSection: FC<{ details: ISaveDetails; t: Localize }> = ({
  details,
  t,
}) => {
  const rows: [string, string][] = [];
  if (details.kingdom !== undefined) {
    rows.push([t("Kingdom"), formatKingdom(details.kingdom, t)]);
  }
  if (details.wars !== undefined) {
    rows.push([
      t("At War With"),
      details.wars.length > 0 ? details.wars.join(", ") : t("No one"),
    ]);
  }
  if (details.spouseName !== undefined) {
    rows.push([t("Spouse"), details.spouseName ?? t("Unmarried")]);
  }
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="bls-details-section bls-small">
      <h3 className="bls-title-xs">{t("Campaign")}</h3>
      <dl className="bls-facts">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
};

const EmptySidebar: FC<{ t: Localize }> = ({ t }) => (
  <div className="bls-empty bls-small">
    <span className="bls-empty-icon">
      <Icon name="savegame" />
    </span>
    <h2>{t("Select a save")}</h2>
    <p>
      {t(
        "Its campaign, the mods it was made with and any problems show up here.",
      )}
    </p>
  </div>
);

export const Sidebar: FC<SidebarProps> = (props) => {
  const { save, launchSave, hasBLSE, onLaunchSave, saveLoadOrder } = props;

  const { localize: t } = useLocalization();
  // Read from the save itself, it shows once read
  const details = useSaveDetails(save?.name);

  if (!save) {
    return (
      <aside className="bls-details" aria-label={t("Save details")}>
        <EmptySidebar t={t} />
      </aside>
    );
  }

  const hero =
    save.characterName !== undefined && details?.clanName !== undefined
      ? t("{{name}} of {{clan}}", {
          name: save.characterName,
          clan: details.clanName,
        })
      : save.characterName;
  const subtitle = [
    hero,
    save.mainHeroLevel !== undefined
      ? t("Level {{level}}", { level: `${save.mainHeroLevel}` })
      : undefined,
    details?.date !== undefined
      ? formatDate(details.date, t)
      : save.dayLong !== undefined
        ? t("Day {{day}}", { day: `${Math.floor(save.dayLong)}` })
        : undefined,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");

  const modules = Object.entries(save.modules);
  const healthy = save.mainPartyHealthyMemberCount;
  const wounded = save.mainPartyWoundedMemberCount;

  return (
    <aside className="bls-details" aria-label={t("Save details")}>
      <section className="bls-details-section bls-details-header bls-small">
        <div className="bls-details-identity">
          <BannerImage
            className="bls-details-banner"
            code={save.clanBannerCode}
            modules={Object.keys(save.modules)}
            label={t("Clan banner")}
          />
          <div>
            <h2>{save.name}</h2>
            {subtitle !== "" && <p className="bls-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="bls-stats">
          <Stat label={t("Gold")} value={formatNumber(save.mainHeroGold)} />
          <Stat label={t("Fiefs")} value={formatNumber(save.clanFiefs)} />
          <Stat
            label={t("Influence")}
            value={formatNumber(save.clanInfluence)}
          />
          <Stat
            label={t("Troops")}
            value={
              healthy !== undefined
                ? wounded
                  ? t("{{healthy}} + {{wounded}} wounded", {
                      healthy: healthy.toLocaleString(),
                      wounded: wounded.toLocaleString(),
                    })
                  : healthy.toLocaleString()
                : null
            }
          />
          <Stat
            label={t("Prisoners")}
            value={formatNumber(save.mainPartyPrisonerMemberCount)}
          />
          <Stat label={t("Food")} value={formatNumber(save.mainPartyFood)} />
          {/* Read from the save itself, a dash until it is read */}
          <Stat
            label={t("Clan Tier")}
            value={formatNumber(details?.clanTier)}
          />
          <Stat label={t("Renown")} value={formatNumber(details?.clanRenown)} />
          <Stat
            label={t("Clan Members")}
            value={formatNumber(details?.clanMemberCount)}
          />
          <Stat
            label={t("Companions")}
            value={formatNumber(details?.companionCount)}
          />
          <Stat label={t("Age")} value={formatNumber(details?.heroAge)} />
          <Stat
            label={t("Children")}
            value={formatNumber(details?.childCount)}
          />
        </div>
      </section>

      {details !== undefined && <CampaignSection details={details} t={t} />}

      {hasBLSE && (
        <LaunchSection
          save={save}
          launchSave={launchSave}
          onLaunchSave={onLaunchSave}
          t={t}
        />
      )}

      <section className="bls-details-section bls-small">
        <h3 className="bls-title-xs">{t("Compatibility")}</h3>
        <IssueGroups save={save} t={t} />
      </section>

      <LoadOrderSection save={save} actions={saveLoadOrder} t={t} />

      <section className="bls-details-section bls-small">
        <h3 className="bls-title-xs">{t("About This Save")}</h3>
        <dl className="bls-facts">
          <dt>{t("Game Version")}</dt>
          <dd>
            {save.applicationVersion
              ? versionToString(save.applicationVersion)
              : "—"}
          </dd>
          <dt>{t("Saved")}</dt>
          <dd>{formatSaveTime(save) || "—"}</dd>
          <dt>{t("File")}</dt>
          <dd>{`${save.name}.sav`}</dd>
        </dl>
      </section>

      <section className="bls-details-section bls-small">
        <div className="bls-section-heading">
          <h3 className="bls-title-xs">{t("Mods in This Save")}</h3>
          <span className="bls-muted">{modules.length}</span>
        </div>
        <ul className="bls-list">
          {modules.map(([name, version]) => (
            <li key={name} className="bls-list-item bls-module-item">
              <span className="bls-item-main bls-item-name">{name}</span>
              <span className="bls-item-meta">{versionToString(version)}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
};
