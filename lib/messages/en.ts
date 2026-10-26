import { tidy, type MessageBuilder } from "./types";

export const buildEnglish: MessageBuilder = (status, v) => {
  const pins = v.suggestedPins.join(" or ");
  const place = v.pin ? `pin ${v.pin}` : v.city;

  switch (status) {
    case "APPROVED":
      return tidy([
        `Namaste ${v.name}, good news from ${v.brandName}.`,
        `Your franchise application for ${place} in ${v.city} is approved.`,
        "We will start documents and KYC this week and issue the franchise agreement.",
        v.trainingStore && v.trainingWeeks
          ? `Your training will be at ${v.trainingStore} for ${v.trainingWeeks} weeks.`
          : null,
        v.launchDate ? `The planned opening date is ${v.launchDate}.` : null,
        "Your onboarding manager will call you within two working days.",
      ]);

    case "WAITLISTED":
      return tidy([
        `Namaste ${v.name}, thank you for applying to ${v.brandName}.`,
        `Your application for ${v.city} is complete and meets our requirements, but every slot in this territory is currently filled.`,
        "You are on the waiting list and we will contact you the moment one opens.",
        "Nothing further is needed from you right now.",
      ]);

    case "ON HOLD":
      return tidy([
        `Namaste ${v.name}, thank you for applying to ${v.brandName}.`,
        `Your application for ${v.city} is on hold while we confirm one detail.`,
        v.unlockCondition,
        v.reservedUntil && v.pin
          ? `We have held pin ${v.pin} for you until ${v.reservedUntil}.`
          : null,
        "Please reply with this and we will continue straight away.",
      ]);

    case "REDIRECTED":
      return tidy([
        `Namaste ${v.name}, thank you for applying to ${v.brandName}.`,
        v.pin ? `We cannot open a store in pin ${v.pin},` : "We cannot open a store at the location given,",
        pins
          ? `but ${pins} ${v.suggestedPins.length === 1 ? "is" : "are"} open nearby.`
          : "but we will point you to an open pin code as soon as one frees up.",
        pins ? `If you can find a site in ${pins}, we would be glad to take your application forward.` : null,
        "This is not a rejection.",
      ]);

    case "NOT PROCEEDING":
      return tidy([
        `Namaste ${v.name}, thank you for your interest in ${v.brandName}.`,
        "We are not able to take this application forward at the moment.",
        v.unlockCondition,
        "We will keep your application on file and will contact you if this changes.",
      ]);
  }
};
