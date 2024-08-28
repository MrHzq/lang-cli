const axios = require("axios");
const path = require("path");

const configPath = path.join(path.dirname(__dirname), ".env");
require("dotenv").config({ path: configPath });

// 百度翻译 API 的 URL
const apiUrl = "https://fanyi-api.baidu.com/api/trans/vip/translate";

// 您的 API 密钥
const appKey = process.env.appKey;
const secretKey = process.env.secretKey;

// 随机数作为盐值
const salt = Math.random().toString().substr(2, 8);

// 计算签名
const getSign = (appKey, query, salt, secretKey) => {
  const str = appKey + query + salt + secretKey;
  const hash = require("crypto").createHash("md5").update(str).digest("hex");
  return hash;
};

// 要翻译的内容和源语言、目标语言
module.exports = async ({ query, from, to }) => {
  const params = {
    q: query,
    from,
    to,
    appid: appKey,
    salt,
    // 生成签名
    sign: getSign(appKey, query, salt, secretKey),
  };

  const { data } = await axios.get(apiUrl, { params });

  if (data.error_code) {
    return data;
  } else {
    return { trans_result: data.trans_result[0] };
  }
};
