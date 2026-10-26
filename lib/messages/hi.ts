import { tidy, type MessageBuilder } from "./types";

export const buildHindi: MessageBuilder = (status, v) => {
  const pins = v.suggestedPins.join(" या ");
  const place = v.pin ? `पिन ${v.pin}` : v.city;

  switch (status) {
    case "APPROVED":
      return tidy([
        `नमस्ते ${v.name}, ${v.brandName} की ओर से अच्छी ख़बर है।`,
        `${v.city} के ${place} के लिए आपका फ़्रैंचाइज़ी आवेदन स्वीकृत हो गया है।`,
        "हम इसी सप्ताह दस्तावेज़ और KYC शुरू करेंगे और फ़्रैंचाइज़ी अनुबंध जारी करेंगे।",
        v.trainingStore && v.trainingWeeks
          ? `आपकी ट्रेनिंग ${v.trainingStore} पर ${v.trainingWeeks} सप्ताह की होगी।`
          : null,
        v.launchDate ? `नियोजित उद्घाटन तिथि ${v.launchDate} है।` : null,
        "हमारे ऑनबोर्डिंग मैनेजर दो कार्यदिवसों के भीतर आपको कॉल करेंगे।",
      ]);

    case "WAITLISTED":
      return tidy([
        `नमस्ते ${v.name}, ${v.brandName} में आवेदन करने के लिए धन्यवाद।`,
        `${v.city} के लिए आपका आवेदन पूरा है और हमारी सभी शर्तें पूरी करता है, लेकिन इस क्षेत्र की सभी जगहें फ़िलहाल भरी हुई हैं।`,
        "आप प्रतीक्षा सूची में हैं और जगह खाली होते ही हम आपसे संपर्क करेंगे।",
        "अभी आपको कुछ और करने की ज़रूरत नहीं है।",
      ]);

    case "ON HOLD":
      return tidy([
        `नमस्ते ${v.name}, ${v.brandName} में आवेदन करने के लिए धन्यवाद।`,
        `एक जानकारी की पुष्टि होने तक ${v.city} के लिए आपका आवेदन रोका गया है।`,
        v.unlockCondition,
        v.reservedUntil && v.pin
          ? `हमने पिन ${v.pin} आपके लिए ${v.reservedUntil} तक सुरक्षित रखा है।`
          : null,
        "कृपया यह जानकारी भेजें, हम तुरंत आगे बढ़ेंगे।",
      ]);

    case "REDIRECTED":
      return tidy([
        `नमस्ते ${v.name}, ${v.brandName} में आवेदन करने के लिए धन्यवाद।`,
        v.pin ? `पिन ${v.pin} में हम नया स्टोर नहीं खोल सकते,` : "दिए गए स्थान पर हम नया स्टोर नहीं खोल सकते,",
        pins ? `लेकिन पास में ${pins} उपलब्ध है।` : "लेकिन जगह खाली होते ही हम आपको दूसरा पिन कोड बताएँगे।",
        pins ? `यदि आप ${pins} में जगह ढूँढ सकें तो हम आपका आवेदन आगे बढ़ाने में ख़ुश होंगे।` : null,
        "यह अस्वीकृति नहीं है।",
      ]);

    case "NOT PROCEEDING":
      return tidy([
        `नमस्ते ${v.name}, ${v.brandName} में रुचि दिखाने के लिए धन्यवाद।`,
        "फ़िलहाल हम इस आवेदन को आगे नहीं बढ़ा पा रहे हैं।",
        v.unlockCondition,
        "आपका आवेदन हमारे रिकॉर्ड में रहेगा और स्थिति बदलने पर हम आपसे संपर्क करेंगे।",
      ]);
  }
};
