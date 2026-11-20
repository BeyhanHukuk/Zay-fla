// Birleştirme sonrası elle düzeltmeler (node tools/merge-extra.js tools/alias-overrides.js)
window.ALIAS_FIXES = Object.assign(window.ALIAS_FIXES || {}, {
  "şekersiz ketçap": "a-ketcap-sekersiz", "sekersiz ketcap": "a-ketcap-sekersiz",
  // sade ürün adı hazır yemeğe değil ürünün kendisine gider (kullanıcı kuralı)
  "mercimek": "mercimek-haslanmis", "nohut": "nohut-haslanmis", "bulgur": "bulgur-cig", "puding": "a-puding-vanilyali",
  "kuşburnu": "d-kusburnu", "kusburnu": "d-kusburnu", "barbunya": "d-barbunya",
  // faz 1'de karışık kuruyemişe eklenen hâlli adlar, artık kendi çeşitlerine
  "kavrulmuş kuruyemiş": "x-kuruyemis-kavrulmus", "kavrulmus kuruyemis": "x-kuruyemis-kavrulmus",
  "kavrulmuş kuru yemiş": "x-kuruyemis-kavrulmus", "kavrulmus kuru yemis": "x-kuruyemis-kavrulmus",
  "kavrulmuş karışık kuruyemiş": "x-kuruyemis-kavrulmus", "kavrulmus karisik kuruyemis": "x-kuruyemis-kavrulmus",
  "tuzlu kuruyemiş": "x-kuruyemis-standart", "tuzlu kuruyemis": "x-kuruyemis-standart",
  "tuzlu kuru yemiş": "x-kuruyemis-standart", "tuzlu kuru yemis": "x-kuruyemis-standart",
  "tuzlu fıstık": "yer-fistigi", "tuzlu fistik": "yer-fistigi",
  // sade ad sade ürüne: krep, poğaça; çiğ ürün: kestane
  "krep": "d-krep", "sade krep": "d-krep", "poğaça": "y-pogaca-sade", "pogaca": "y-pogaca-sade", "kestane": "d-kestane-cig"
});
