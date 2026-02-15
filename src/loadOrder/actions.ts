const setFBForceUpdate = (profileId: string) => ({
  type: "SET_FB_FORCE_UPDATE" as const,
  payload: { profileId },
});

export const actionsLoadOrder = {
  setFBForceUpdate,
};
