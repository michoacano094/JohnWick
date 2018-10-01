const fs = require('fs');
const path = require('path');
const { atob } = require('abab');
const { PakExtractor } = require('john-wick-extra/extract');
const { GetItemPaths } = require('john-wick-extra/process');

/*const Fortnite = require('fortnite-api');
const { FortniteToken } = require('./tokens');

var fortniteAPI = new Fortnite(FortniteToken, {
    debug: true,
});

fortniteAPI.login();*/

var storeData = false;
storeData = JSON.parse(fs.readFileSync('store.json'));

function RefreshStoreData() {
    return fortniteAPI.getStore('en').then(store => {
        fs.writeFileSync('store.json', JSON.stringify(store));
        storeData = store;
        return store;
    });
}

function GetStoreData() {
    return Promise.resolve(storeData);
    if (!storeData) return RefreshStoreData();
    var now = new Date();
    var expires = new Date(storeData.expiration);
    if (now > expires) return RefreshStoreData();
    return Promise.resolve(storeData);
}

function GetStoreItems(storeData) {
    return storeData.storefronts.filter(v => v.name == 'BRDailyStorefront' || v.name == 'BRWeeklyStorefront').map(v => v.catalogEntries).reduce((acc, v) => acc.concat(v), []).map(v => v.devName);
}

function GetStoreInfo(storeData) {
    return storeData.storefronts.filter(v => v.name == 'BRDailyStorefront' || v.name == 'BRWeeklyStorefront')
        .map(v => v.catalogEntries)
        .reduce((acc, v) => acc.concat(v), []);
}

// from https://stackoverflow.com/questions/39460182/decode-base64-to-hexadecimal-string-with-javascript
function base64ToBase16(base64) {
  return atob(base64)
      .split('')
      .map(function (aChar) {
        return ('0' + aChar.charCodeAt(0).toString(16)).slice(-2);
      })
     .join('');
}
// *

function BuildPakMap() {
    return fs.readdirSync('./live/paks/', 'utf8').map(v => {
        let extractor = new PakExtractor('./live/paks/' + v);
        extractor.readHeader();
        return {
            file: v,
            guid: extractor.header.EncryptionKeyGuid.toString(),
            extractor: extractor,
        };
    });
}

async function PrepareStoreAssets(storeData) {
    let storeInfo = await storeData;
    let keyDatas = storeInfo.storefronts
        .filter(v => v.hasOwnProperty('catalogEntries'))
        .reduce((acc, v) => acc.concat(v.catalogEntries), [])
        .filter(v => v.hasOwnProperty('metaInfo') && v.metaInfo.map(e => e.key).includes("EncryptionKey"))
        .map(v => v.metaInfo.filter(e => e.key == 'EncryptionKey').pop().value)
        .reduce((acc, v) => acc.concat(v.split(',').map(e => e.split(':')).map(e => ({guid: e[0].toLowerCase(), key: base64ToBase16(e[1]), asset: e[2]}))), []);

    if (keyDatas.length <= 0) return storeInfo;
    let guidList = keyDatas.map(v => v.guid);
    let pakMap = BuildPakMap().filter(v => guidList.includes(v.guid));
    pakMap.forEach(v => {
        v.extractor.replaceKey(keyDatas.filter(e => e.guid == v.guid).pop().key);
        v.extractor.readIndex();
        let paths = GetItemPaths(v.extractor.PakIndex.IndexEntries.map(v => v.Filename.toString()));
        console.log(paths);
    });

    return storeInfo;
}

PrepareStoreAssets(GetStoreData());

function GetAssetData(storeItem) {
    const assetList = JSON.parse(fs.readFileSync('./assets.json'));
    try {
        if (storeItem.hasOwnProperty('itemGrants') && storeItem.itemGrants.length > 0) {
            var price = storeItem.prices[0].finalPrice;
            var asset = storeItem.itemGrants[0].templateId.split(':');
            let [assetData] = assetList.filter(v => v.id == asset[1]);
            if (!assetData) throw asset + " not found";

            let storeObj = {
                imagePath: assetData.image,
                displayName: assetData.name,
                price: price,
                rarity: assetData.rarity,
                description: assetData.description,
            };

            if (storeItem.hasOwnProperty('displayAssetPath')) {
                let daPath = path.basename(storeItem.displayAssetPath).split('.')[0].toLowerCase();
                let [daAsset] = assetList.filter(v => v.id == daPath);
                if (daAsset) storeObj.imagePath = daAsset.image;
            }

            return storeObj;
        }
    } catch (error) {
        console.error(error);
        return {
            imagePath: false,
            displayName: storeItem.devName,
            price: storeItem.prices[0].finalPrice,
            rarity: false,
        };
    }
    return false;
}

function GetChangeData(changeItem) {
    return {
        imagePath: changeItem.image,
        displayName: changeItem.name,
        rarity: changeItem.rarity,
        description: changeItem.description,
    };
}

function GetChangeItems() {
    if (!fs.existsSync('changelist.json')) return [];
    return JSON.parse(fs.readFileSync('changelist.json')).map(GetChangeData);
}

exports.GetChangeItems = GetChangeItems;
exports.GetAssetData = GetAssetData;
exports.GetStoreData = GetStoreData;
exports.GetStoreItems = GetStoreItems;
exports.GetStoreInfo = GetStoreInfo;
exports.PrepareStoreAssets = PrepareStoreAssets;
