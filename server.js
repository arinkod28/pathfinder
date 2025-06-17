const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// SerpAPI key 
const SERPAPI_KEY = 'YOUR KEY HERE';

// Your Hugging Face API token 
const HF_API_TOKEN = 'YOUR KEY HERE';


const structureSearchResults = (results) => {
  const structuredData = {
    personalInfo: [],
    professionalInfo: [],
    educationInfo: [],
    otherInfo: []
  };

  results.forEach(result => {
    const { title, snippet, link } = result;
    const text = `${title}: ${snippet}`.toLowerCase();

    if (text.includes('education') || text.includes('university') || text.includes('college') || text.includes('school')) {
      structuredData.educationInfo.push({ title, snippet, link });
    } else if (text.includes('job') || text.includes('work') || text.includes('career') || text.includes('company') || text.includes('position')) {
      structuredData.professionalInfo.push({ title, snippet, link });
    } else if (text.includes('born') || text.includes('age') || text.includes('birth') || text.includes('location') || text.includes('city')) {
      structuredData.personalInfo.push({ title, snippet, link });
    } else {
      structuredData.otherInfo.push({ title, snippet, link });
    }
  });

  return structuredData;
};

// Helper function to format the summary
const formatSummary = (summary, structuredData) => {
  const sections = [];
  
  // Add main summary
  sections.push({
    type: 'summary',
    content: summary,
    title: 'AI Summary'
  });

  // Add structured sections if they have content
  if (structuredData.personalInfo.length > 0) {
    sections.push({
      type: 'personal',
      content: structuredData.personalInfo.map(info => info.snippet).join('\n'),
      title: 'Personal Information',
      sources: structuredData.personalInfo.map(info => ({ title: info.title, link: info.link }))
    });
  }

  if (structuredData.professionalInfo.length > 0) {
    sections.push({
      type: 'professional',
      content: structuredData.professionalInfo.map(info => info.snippet).join('\n'),
      title: 'Professional Background',
      sources: structuredData.professionalInfo.map(info => ({ title: info.title, link: info.link }))
    });
  }

  if (structuredData.educationInfo.length > 0) {
    sections.push({
      type: 'education',
      content: structuredData.educationInfo.map(info => info.snippet).join('\n'),
      title: 'Education',
      sources: structuredData.educationInfo.map(info => ({ title: info.title, link: info.link }))
    });
  }

  if (structuredData.otherInfo.length > 0) {
    sections.push({
      type: 'other',
      content: structuredData.otherInfo.map(info => info.snippet).join('\n'),
      title: 'Additional Information',
      sources: structuredData.otherInfo.map(info => ({ title: info.title, link: info.link }))
    });
  }

  return sections;
};

app.post('/search-person', async (req, res) => {
  const { name, extraDetails } = req.body;

  try {
    // Step 1: Get search results from SerpAPI
    const serpResponse = await axios.get('https://serpapi.com/search.json', {
      params: {
        q: `${name} ${extraDetails || ''}`,
        api_key: SERPAPI_KEY
      }
    });

    const results = serpResponse.data.organic_results || [];
    
    if (results.length === 0) {
      return res.json({
        success: false,
        message: 'No search results found.',
        sections: []
      });
    }

    // Structure the search results
    const structuredData = structureSearchResults(results);

    // Combine snippets for AI summary
    const combinedSnippets = results
      .map(r => `${r.title}: ${r.snippet}`)
      .join('\n\n');

    // Step 2: Get AI summary
    const hfResponse = await axios.post(
      'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
      { inputs: combinedSnippets },
      {
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const summary = hfResponse.data[0]?.summary_text || 'Summary not available';

    // Format the final response
    const formattedResponse = {
      success: true,
      sections: formatSummary(summary, structuredData),
      metadata: {
        searchQuery: `${name} ${extraDetails || ''}`.trim(),
        totalSources: results.length,
        timestamp: new Date().toISOString()
      }
    };

    res.json(formattedResponse);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
