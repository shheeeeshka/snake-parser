import puppeteer from "puppeteer";
import { google } from "googleapis";

import { config } from "dotenv";
import { sleep } from "./utils.js";

config();

async function main() {
    const auth = new google.auth.GoogleAuth({
        keyFile: "credentials.json",
        scopes: "https://www.googleapis.com/auth/spreadsheets",
    });

    const client = await auth.getClient();

    const googleSheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.SPREADSHEET_ID;

    const metaData = await googleSheets.spreadsheets.get({
        auth,
        spreadsheetId,
    });

    // read rows
    const { data } = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: "Лист1!A2:A",
    });

    const productNames = data.values?.reduce((acc, el) => {
        acc.push(...el);
        return acc;
    }, []);

    // await googleSheets.spreadsheets.values.append({
    //     auth,
    //     spreadsheetId,
    //     range: "Лист1",
    //     valueInputOption: "USER_ENTERED",
    //     resource: {
    //         values: [
    //             ["Salut", "Peter"],
    //             ["Salut", "Evgen"]
    //         ],
    //     },
    // });

    console.log(productNames);
    await sleep(1);

    // const executablePath = process.env.OS === "macos" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "";
    const browser = await puppeteer.launch({
        headless: process.env.SHOW_BROWSER === "1" ? false : true,
        defaultViewport: false,
        timeout: 0,
        protocolTimeout: 0,
        userDataDir: "./tmp",
        // executablePath,
    });
    const page = await browser.newPage();

    await page.goto(process.env.TARGET_URL, { waitUntil: "domcontentloaded", timeout: 61000 });
    await page.setViewport({ width: 1820, height: 1080 });


    const searchFormSelector = "#app>.body__header>header>div>div:nth-child(3)>div>form";
    const searchInputSelector = searchFormSelector + ">div>div:nth-child(2)>input:nth-child(2)";
    const searchButtonSelector = searchFormSelector + ">button";

    const searchInput = await page.$(searchInputSelector);
    const searchButton = await page.$(searchButtonSelector);

    await sleep(6);

    if (!searchInput || !searchButton) {
        throw new Error("Search Input or Search Button is not defined");
    }

    const characteristics = {};
    // const characteristicsListSelector = "#app>.body__wrapper>.body__content>div>div:last-child>div:last-child>div>div>div>div>ul>li:nth-child(3)>dl>dd>p";

    for (let p of productNames) {
        await page.evaluate(input => input.value = "", searchInput);
        await searchInput.type(p || "Oooops...").catch(err => console.error(err.message));
        await searchButton.click().catch(err => console.error(err.message));
        await sleep(4);
        // await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(err => console.error(err.message));

        const isList = await page.evaluate((p) => {
            const list = document.querySelectorAll("#app>.body__wrapper>.body__content>div>.CardsListSortPager>.CardsGrid>div");
            if (!list || !list?.length) return false;
            for (el of list) {
                if (el?.querySelector("div>span")?.textContent?.toLowerCase() === p?.toLowerCase()) {
                    el?.querySelector("div>a")?.click();
                    return true;
                }
            }
            list[0]?.querySelector("div>a")?.click();
            return true;
        }, p);

        console.log({ isList });

        if (isList) {
            await sleep(6);
        }


        const productCharacteristics = await page.evaluate(() => {
            const mainInfo = document.querySelector("#app>.body__wrapper>.body__content>div>section");
            const charList = document.querySelectorAll("#app>.body__wrapper>.body__content>div>div:last-child>div:last-child>div>div>div>div>ul>li");
            const charList2 = document.querySelectorAll("#app>.body__wrapper>.body__content>div>div:last-child>div:last-child>div>div>div>div:nth-child(2)>div>div>div");
            const c = {};

            charList?.forEach((item, i) => {
                const key = item.querySelector(`dl>dt`)?.textContent;
                const value = item.querySelector(`dl>dd>p`)?.textContent;
                c[key] = value;
            });

            charList2?.forEach((item, i) => {
                const key = item.querySelector(`h3`)?.textContent;
                const value = item.querySelector(`div>.readMore__text>dl>div>dd`)?.textContent;
                c[key] = value;
            });

            c["Фото"] = mainInfo.querySelector("div>div>div>picture>img")?.getAttribute("src");
            c["Цена"] = mainInfo.querySelector("div:last-child>div>div>.ProductOffer__price>span").textContent;

            return c;
        });

        characteristics[p] = productCharacteristics;
        console.log(characteristics);
    }

    const valuesToAppend = [];

    await googleSheets.spreadsheets.values.clear({
        auth,
        spreadsheetId,
        range: "Лист1",
    });

    const headers = ["Название товара"];
    const firstProduct = productNames[0];
    if (firstProduct) {
        const productProps = characteristics[firstProduct] || {};
        Object.keys(productProps).forEach(key => {
            if (!headers.includes(key)) {
                headers.push(key);
            }
        });
    }
    valuesToAppend.push(headers);

    for (const productName of productNames) {
        const productProps = characteristics[productName] || {};
        const row = [productName];

        headers?.slice(1).forEach(header => {
            row.push(productProps[header] || "");
        });

        valuesToAppend.push(row);
    }

    googleSheets.spreadsheets.values.append({
        auth,
        spreadsheetId,
        range: `Лист1!A1`,
        valueInputOption: "USER_ENTERED",
        resource: {
            values: valuesToAppend,
        },
    });

    await sleep(20);
    await browser.close();
}

main();