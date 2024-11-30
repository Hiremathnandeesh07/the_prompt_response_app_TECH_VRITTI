// Import required libraries
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // To load the API key from .env file
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();
const markdownIt = require('markdown-it'); // Markdown parser


// Initialize express app
const app = express();

// Setup middleware for parsing JSON bodies and using EJS
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Google Generative AI client with your API key
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY); // Ensure your API key is correctly loaded from .env

// Serve the form when the user accesses the root URL (GET request)
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/search', async (req, res) => {
    const keyword = req.body.keyword;

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // Step 1: Disambiguation Prompt
        const disambiguationPrompt = `Provide short meanings for the term "${keyword}" in various contexts.`;
        const disambiguationResult = await model.generateContent(disambiguationPrompt);
        const disambiguationText = disambiguationResult.response.text().trim();

        // Convert Markdown to plain text
        const md = new markdownIt();
        const plainDisambiguationText = md.render(disambiguationText).replace(/<[^>]*>/g, ''); // Remove any HTML tags

        console.log('Processed meanings:', plainDisambiguationText);

        // Step 2: Extract Key Information
        const extractKeyInfoPrompt = `Extract key words and details from the following text: "${keyword}".`;
        const extractKeyInfoResult = await model.generateContent(extractKeyInfoPrompt);
        const extractedKeyInfo = extractKeyInfoResult.response.text().trim();
        
        // Convert Markdown to plain text
        const plainExtractedKeyInfo = md.render(extractedKeyInfo).replace(/<[^>]*>/g, '');

        console.log('Extracted Key Information:', plainExtractedKeyInfo);

        // Step 3: Current State of the User or Entity
        const currentStatePrompt = `Based on the following text, identify the current state or status of the user or entity: "${keyword}".`;
        const currentStateResult = await model.generateContent(currentStatePrompt);
        const currentState = currentStateResult.response.text().trim();

        console.log('Current State:', currentState);

        // Step 4: Target State
        const targetStatePrompt = `Based on the following text, identify the target state or goal of the user or entity: "${keyword}".`;
        const targetStateResult = await model.generateContent(targetStatePrompt);
        const targetState = targetStateResult.response.text().trim();

        console.log('Target State:', targetState);

        // Send plain text (without HTML or Markdown) to the EJS template
        return res.render('disambiguate', { 
            keyword, 
            disambiguationText: plainDisambiguationText, // plain text
            extractedKeyInfo: plainExtractedKeyInfo, // plain text
            currentState, 
            targetState, 
        });

    } catch (error) {
        handleError(error, res);
    }
});





const puppeteer = require('puppeteer');

// Route to scrape data for the target state
app.post('/scrap', async (req, res) => {
    const targetState = req.body.targetState;
    const currentState = req.body.currentState;
    if (!targetState || !currentState) {
        return res.status(400).send('Target state and current state are required.');
    }
    console.log('Target State:', targetState);
    console.log('Current State:', currentState);
    if (!targetState) {
        return res.status(400).send('Target state is required.');
    }

    try {
        // Launch Puppeteer browser
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Perform a Google search for the target state
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(targetState)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

        // Wait for search results to load
        await page.waitForSelector('h3');

        // Scrape the titles and links from the Google search results
        const results = await page.evaluate(() => {
            const data = [];
            const searchResults = document.querySelectorAll('div.g');
            searchResults.forEach(result => {
                const title = result.querySelector('h3')?.innerText;
                const link = result.querySelector('a')?.href;
                if (title && link) {
                    data.push({ title, link });
                }
            });
            return data;
        });

        // Array to hold scraped content from the websites
        const scrapedContent = [];

        // Scrape content from each of the result links
        for (const result of results) {
            const { title, link } = result;

            // Open each link in a new page and extract content
            const pageContent = await browser.newPage();
            await pageContent.goto(link, { waitUntil: 'domcontentloaded' });

            // Scrape relevant content from the page
            const content = await pageContent.evaluate(() => {
                const paragraphs = Array.from(document.querySelectorAll('p'));
                return paragraphs.slice(0, 3).map(p => p.innerText).join(' '); // First 3 paragraphs
            });

            // Convert the content from HTML to plain text using markdown-it (if needed)
            const cleanContent = md.render(content); // Converts markdown to HTML, if the content has markdown

            // Push to scrapedContent with cleaned-up text
            scrapedContent.push({
                title,
                link,
                content: cleanContent.replace(/<\/?[^>]+(>|$)/g, "") // Removes any leftover HTML tags
            });

            await pageContent.close();
        }

        // Close the browser
        await browser.close();

        // Render the results in the 'scrap' view
        return res.render('scrap', { scrapedResults: scrapedContent, targetState, currentState });

    } catch (error) {
        console.error('Error scraping data:', error);
        return res.status(500).send('Failed to scrape data. Please try again.');
    }
});



// Route for performing gap analysis
app.post('/gap-analysis', async (req, res) => {
    const { scrapedResults, targetState, currentState } = req.body;

    if (!scrapedResults || !targetState || !currentState) {
        return res.status(400).send('Scraped data, target state, and current state are required.');
    }

    const parsedScrapedResults = JSON.parse(scrapedResults); // Parse the JSON string

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const gapAnalysisPrompt = `
    Given the following information:

Current State: ${currentState}
Target State: ${targetState}
Web-Scraped Data: ${JSON.stringify(parsedScrapedResults)}
Please perform a gap analysis and:

shortly Identify areas where the user is underdeveloped and needs improvement. 
shortly Highlight any critical aspects that are missing and are hindering progress toward the target state.
shortly Provide actionable recommendations to help bridge the gap and achieve the target state.
Your response should be short insightful, constructive, and focused on practical improvements`;

        const gapAnalysisResult = await model.generateContent(gapAnalysisPrompt);
        const gapAnalysisResponse = gapAnalysisResult.response.text().trim();

        // Convert gap analysis response and scraped results to proper text format
        const formattedGapAnalysis = md.render(gapAnalysisResponse); // Convert markdown to HTML
        const formattedScrapedResults = parsedScrapedResults.map(result => {
            result.content = md.render(result.content); // Convert each scraped content to HTML
            return result;
        });

        return res.render('gapAnalysis', {
            currentState,
            targetState,
            scrapedResults: formattedScrapedResults,
            gapAnalysis: formattedGapAnalysis,
        });

    } catch (error) {
        console.error('Error performing gap analysis:', error);
        return res.status(500).send('Failed to perform gap analysis. Please try again.');
    }
});



const { Document, Packer, Paragraph, TextRun } = require('docx');
const { JSDOM } = require('jsdom');

app.post('/download-gap-analysis', async (req, res) => {
    const { gapAnalysis } = req.body;

    // Log the received data to check if it's being passed correctly
    console.log('Received gap analysis content:', gapAnalysis);

    if (!gapAnalysis) {
        return res.status(400).send('Gap analysis content is required.');
    }

    try {
        // Create an array to hold formatted paragraphs
        const paragraphs = [];

        // Parse gap analysis content as HTML-like structure
        const dom = new JSDOM(gapAnalysis);
        const docContent = dom.window.document;

        // Extract elements and format them for the Word document
        docContent.body.childNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
                if (node.tagName === 'P') {
                    // Regular paragraph
                    paragraphs.push(
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: node.textContent.trim(),
                                    size: 24, // Regular text size
                                }),
                            ],
                            spacing: { after: 200 },
                        })
                    );
                } else if (node.tagName === 'UL') {
                    // Bullet list
                    node.childNodes.forEach(li => {
                        if (li.tagName === 'LI') {
                            paragraphs.push(
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: li.textContent.trim(),
                                            size: 24, // Regular text size
                                        }),
                                    ],
                                    bullet: { level: 0 },
                                    spacing: { after: 100 },
                                })
                            );
                        }
                    });
                } else if (node.tagName === 'STRONG') {
                    // Bold headings
                    paragraphs.push(
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: node.textContent.trim(),
                                    bold: true,
                                    size: 28, // Heading size
                                }),
                            ],
                            spacing: { before: 200, after: 100 },
                        })
                    );
                }
            }
        });

        // Create the Word document with the structured paragraphs
        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: 'Gap Analysis for Lead Backend Engineer at Amazon',
                                    bold: true,
                                    size: 32, // Title size
                                }),
                            ],
                            spacing: { after: 300 },
                        }),
                        ...paragraphs,
                    ],
                },
            ],
        });

        // Generate the Word file buffer
        const buffer = await Packer.toBuffer(doc);

        // Set headers and send the file
        res.setHeader('Content-Disposition', 'attachment; filename=Gap_Analysis.docx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
    } catch (error) {
        console.error('Error generating the document:', error);
        return res.status(500).send('Failed to generate the document. Please try again.');
    }
});

// Error handling function
function handleError(error, res) {
    console.error('Error:', error);
    res.status(500).send('Something went wrong. Please try again later.');
}

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});











