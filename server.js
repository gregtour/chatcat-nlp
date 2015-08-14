/* chatcat server
 * anonymous chat search & match
 * greg tourville
 * 2011
 */

// NODE LIBRARIES ////////////////////////////////////////////////////////////
var sys 	= require("sys");
var http	= require('http');
var fs 		= require("fs");
var url 	= require("url");
var io		= require('socket.io');
//var io		= require('../npm/node_modules/socket.io');

// load pre-processed dictionary file
sys.puts("Loading dictionary files...");
var count = require("./dict_counts.txt");
var coinc = require("./dict_coinc.txt");
sys.puts("Success!");
var word_count = count.word_count;
var word_coinc = coinc.word_coinc;
//var word_count = {};
//var word_coinc = {};

// CONSTANTS /////////////////////////////////////////////////////////////////
PORT		 	= 8080;
TOPIC_SIZE   	= 5;
NUM_RESULTS	 	= 15;
TOPIC_LENGTH 	= 66;
MESSAGE_LENGTH 	= 1000;
LOG_FREQUENCY	= 100;

// DATA STRUCTURES ///////////////////////////////////////////////////////////
var uid		= 1;	// unique id counter
var topics	= [];	// array of {topic, id} objects
var clients	= [];	// array of socket.io client objects

var topic_log = "";
var convo_log = "";

// PROTOCOL //////////////////////////////////////////////////////////////////
//
// SERVER -> CLIENT:
//   {event: 'hi', id: u_id}
//   {event: 'results', results: [{topic: str, id: int}]}
//   {event: 'im', text: str, from: u_id}
//
// CLIENT -> SERVER:
//   {event: 'topic', id: u_id, topic: str}
//   {event: 'relay', id: u_id, text: str, to: u_id}

function debug(message)
{
	sys.puts("error: " + message);
}

function sanitizeMessage(message)
{
	if (message.length > MESSAGE_LENGTH)
		message = message.substring(0, MESSAGE_LENGTH);
	return message;
}

function sanitizeTopic(topic)
{
	if (topic.length > TOPIC_LENGTH)
		topic = topic.substring(0, TOPIC_LENGTH);
	return topic;
}

// STOP LIST /////////////////////////////////////////////////////////////////

STOP_LIST = {"t": true, "t ": true};

function StopWords(str)
{
	var words = str.split(" ");
	for (var i = 0; i < words.length; i++)
	{
		var key = "t" + words[i];
		STOP_LIST[key] = true;
	}
}

// list of common / vague words
StopWords("a b c d e f g h i j k l m n o p q r s t u v w x y z");
StopWords("a also an and as at be but by can could do for from");
StopWords("go have he her here his how like my not of on or our out");
StopWords("say she so im if in into it is its that the their there");
StopWords("therefore they this these those through to until we");
StopWords("when where which while who with would you your one");
StopWords("more just was are some up people had yet will were sure");
StopWords("get dont me all them than because really only no over");
StopWords("then time very way well want should make use youre things");
StopWords("youll stuff now without too why didnt know wont has got");
StopWords("even never yes much using first lot since other most still");
StopWords("see same said someone something thing even told took went");
StopWords("year years yourself yeah right wrong might many probably");
StopWords("good best us theyre thought thats theres though everything");
StopWords("adv pl imp pr vb sing pl superl adj obs");

StopWords("what whats about think going been being did any him back actually");

// WORD RELATION DATA & ALGORITHMS ///////////////////////////////////////////


function CompareWords(word1, word2)
{
	var a, b;
	if (word1 < word2)
	{
		a = word1; b = word2;
	}
	else if (word1 == word2)
	{
		return 1;
	}
	else
	{
		a = word2; b = word1;
	}
	
	if (word_coinc[a] === undefined)
	{
		// word 1 is unlisted, we got nothing
		return 0;
	}

	var co = word_coinc[a][b];
	if (co === undefined)
	{
		// word 1 is listed but word 2 never co-occurs, so match failed
		return 0;
	}
	
	// here's where all the magic happens
	return co / word_count[word2] / Math.log(word_count[word1] + 3);
}

function AssociateWords(bag)
{
	for (var j = 0; j < bag.length; j++)
	{
		// maintain a count of how often each word is used by itself
		var word = bag[j];
		if (word_count[word] === undefined)
		{
			word_count[word] = 1;
//			word_coinc[word] = {};
		}
		else
			word_count[word]++;
		
		// count how often word pairs are bagged together
		for (var k = j; k < bag.length; k++)
		{
			var pair = bag[k];
			var a, b;
			if (word < pair)
			{
				a = word; b = pair;
			}
			else
			{
				a = pair; b = word;
			}
			
			if (word_coinc[a] === undefined)
			{
				word_coinc[a] = {};
				word_coinc[a][b] = 1;
			}
			else if (word_coinc[a][b] === undefined)
				word_coinc[a][b] = 1;
			else
				word_coinc[a][b]++;
		}
	}
}

function LoadDictionary(filename)
{
	var numWords = 0;
	
	sys.puts("Attempting to load dictionary '" + filename + "'...");
	
	// load dictionary file and split lines
	var data = fs.readFileSync(filename, "UTF8");
	data = data.toLowerCase();
	data = data.replace(/[^a-zA-Z\s]+/g, '');
	data = data.split("\n");
	
	// create a word bag for each line and add it
	for (var i = 0; i < data.length; i++)
	{
		if (i%100 == 0)
			sys.puts(" line " + (i+1) + " of " + data.length);
		// lower case + remove punctuation & duplicate spaces
		data[i] = data[i].replace(/[\s]+/g, ' ');
		var words = data[i].split(" ");
	
		// create bag of words for the dictionary entry
		var bag = [];
		var hash = {};
		for (var j = 0; j < words.length; j++)
		{
			var word = "t" + words[j];
			if (STOP_LIST[word] === undefined && hash[word] === undefined)
			{
				hash[word] = true;
				bag.push(word);
				numWords++;
			}
		}
		
		// associate the words in the bag in the search engine
		if (bag.length > 0)
			AssociateWords(bag);
	}
	
	var report = "Successfully loaded dictionary '" + filename;
	report += "' with " + data.length + " lines and ";
	report += numWords + " bagged words.";
	
	sys.puts(report);
}

// NATURAL LANGUAGE PROCESSING ///////////////////////////////////////////////

function CompareTopics(searchBag, resultBag)
{
	var score = 0;
	for (var j = 0; j < searchBag.length; j++)
	{
		for (var k = 0; k < resultBag.length; k++)
		{
			score += CompareWords(searchBag[j], resultBag[k]);
		}
	}
	return score;
}

// given an unlisted word, try to find a listed word by stemming
function StemWord(word)
{
	var stems = ['s', 'es', 'ed', 'd', 'ing', 'ly', 'y', 'er', 'ment'];

	var possible = [word];
	while (possible.length > 0)
	{
		var w = possible.pop();
		for (var k = 0; k < stems.length; k++)
		{
			// strip any stems that appear
			if (w.length > stems[k].length &&
				w.substr(w.length-stems[k].length) == stems[k])
			{
				var stem = w.substr(0, w.length - stems[k].length);
				if (word_count[stem])
				{
					// return the first listed word found
					return stem;
				}
				else
					// if its still not a word try ripping more stems off
					possible.push(stem);
			}
		}
	}
	
	// exhausted all options, guess it's just an unlisted word
	return word;
}

// turns the user's topic string into an array of keyword keys
function CreateTopicKeywords(topic)
{
	var clean = topic.toLowerCase();
	clean = clean.replace(/[^a-zA-Z\s]+/g, '');
	clean = clean.replace(/[\s]+/g, ' ');
	
	var words = clean.split(" ");
	var keywords = [];
	for (var i = 0; i < words.length; i++)
	{
		var word = "t" + words[i];
		if (STOP_LIST[word] === undefined)
		{
			if (word_count[word] === undefined)
			{
				word = StemWord(word);
			}
			keywords.push(word);
		}
	}
	
	return keywords;
}


function AddTopic(topic, keywords, id)
{
	topics.push({topic: topic, keywords: keywords, id: id});
	sys.puts("Added topic: '" + topic + "', " + id);
	topic_log += id + "," + topic + "\r\n";
}

function RemoveTopic(id)
{
	for (var i = 0; i < topics.length; i++)
	{
		if (topics[i].id == id)
		{
			topics.splice(i, 1);
			i--;
		}
	}
	
	// debug("failed to remove topic. id " + id + " not found.");
}

function SearchConversations(keywords, sid)
{
	var results = [];
	var scores  = [];
	var worst 	= -1;
	
	// compute relevance of search query to each active user
	for (var i = topics.length-1; i >= 0; i--)
	{
		if (topics[i].id != sid)
		{
			var score = CompareTopics(keywords, topics[i].keywords);
			
			// maintain a list of the NUM_RESULTS best search results
			if (score > worst)
			{
				var result = {
					topic: 	topics[i].topic,
					id:		topics[i].id,
					score:	score
				};

				// if we don't have enough results yet add another column
				if (scores.length < NUM_RESULTS)
				{
					scores.push(-1);
					results.push({});
				}

				// find the index to insert the result
				var j;
				for (j = 0; j < scores.length; j++)
					if (score > scores[j])
						break;
				
				// insert and move each element over except the end
				for (; j < scores.length; j++)
				{
					var last_score  = scores[j];
					var last_result = results[j];			
					scores[j] = score;
					results[j] = result;
					score = last_score;
					result = last_result;
				}
				
				// keep track of the worst score
				if (scores.length < NUM_RESULTS)
					worst = -1;
				else
					worst = scores[NUM_RESULTS-1];
			}
		}
	}
	
	return results;
}

/*
// No search - just return most recent topics
function SearchConversations(topic)
{
	sys.puts("Running search for '" + topic + "' with list of " + topics.length + " topics.");
	results = [];
	for (var i = topics.length-1; i >= 0 && results.length < NUM_RESULTS; i--)
	{
		//sys.puts(topics[i].topic);
		if (topics[i])
		{
			results.push(topics[i]);
		}
	}
	return results;
}
*/

var mime_types = 
{
	html:"text/html",
	htm:"text/html",
	css:"text/css",
	js:"text/javascript",
	png:"image/png",
	jpg:"image/jpeg",
	ico:"image/vnd.microsoft.icon",
	txt:"text/plain"
};

// SERVER HANDLERS ///////////////////////////////////////////////////////////

function staticFileHandler(filename)
{
	// cache the data ahead of time
	var file = fs.readFileSync(filename, "binary");
	var stats = fs.statSync(filename);
	var etag = '"' + stats.ino + '-' + stats.size + '-' + Date.parse(stats.mtime) + '"';
	
	var i = filename.lastIndexOf(".");
	var content_type = "text/plain";
	if (i != -1) 
	{
		var extension = filename.substring(i+1);
		if (extension != "" && mime_types[extension] != undefined)
			content_type = mime_types[extension];
	}	
	
	var header = {
		"Server": 			"chattcatt server",
		"ETag": 			etag,
		"Content-Type": 	content_type,
		"Content-Length": 	file.length
	}
	
	return function(request, response)
	{
		if (request.headers['if-none-match'] != undefined && 
			request.headers['if-none-match'].indexOf(etag) != -1)
		{
			//sys.puts("304 on " + filename);
			response.writeHead(304);
			response.end();
			return;
		}

		// sys.puts("Serving file " + filename + ".");		
		response.writeHead(200, header);  
		response.write(file, "binary");  
		response.end();
	};
}

var root = staticFileHandler("index.html");
var handler = {};

// list of files on the server
handler["index.html"] 	= root;
handler["favicon.ico"] 	= staticFileHandler("favicon.ico");
handler["client.js"] 	= staticFileHandler("client.js");
handler["style.css"] 	= staticFileHandler("style.css");
handler["bubbles.jpg"] 	= staticFileHandler("bubbles.jpg");
handler["bar.png"] 		= staticFileHandler("bar.png");
handler["logo.png"] 	= staticFileHandler("logo.png");

//LoadDictionary("reddit.txt");
//LoadDictionary("small.txt");
//LoadDictionary("dictionary.txt");

// FILE SERVER ///////////////////////////////////////////////////////////////
server = http.createServer(function(req, resp)
{
	var uri = url.parse(req.url).pathname;
	var filename = uri.substring(1);

	if (filename)
	{
		if (handler[filename])
		{
			handler[filename](req, resp);
		}
		else
		{		
			resp.writeHead(404, {"Content-Type": "text/plain"});  
			resp.write("Error 404: file not found");  
			resp.end();
			debug("requested invalid file: '" + filename + "'");			
		}
	}
	else
	{
		root(req, resp);
	}
});

server.listen(PORT);

// SOCKET.IO SERVER //////////////////////////////////////////////////////////

var socket = io.listen(server); 
socket.on('connection', function(client)
{ 
	// create new user, but wait for topic before they really count
	var user_id = uid++;
	clients[user_id] = client;
	
	// incoming ajax
	client.on('message', function(msg)
	{
		if (typeof msg != "object" || msg.event == undefined || msg.id == undefined)
		{
			debug("malformed message");
			return;
		}
		
		if (msg.id != user_id)
		{
			debug("id doesnt match: " + msg_id + " and " + user_id);
			return;
		}
		
		// initialize user, search with their string, and add their topic
		if (msg.event == "topic")
		{
			if (msg.topic == undefined)
			{
				debug("malformed topic message");
				return;
			}
			
			// validate the topic & pull out valid keywords
			var topic = sanitizeTopic(msg.topic);
			var keywords = CreateTopicKeywords(topic);
			
			if (keywords.length > 0)
			{
				// run the search
				var res = SearchConversations(keywords, user_id);
				AddTopic(topic, keywords, user_id);
				
				sys.puts("Search returned with " + res.length + " result(s).");
				
				// respond with search results
				client.send({event: "results", results: res});
			}
			else
			{
				// bad search
				client.send({event: "results", results: []});
				debug("invalid search '" + topic + "'");
				return;
			}
		}
		// chat relay logic		
		else if (msg.event == "relay")
		{
			if (msg.text == undefined || msg.to == undefined)
			{
				debug("malformed relay message");
				return;
			}
			
			var message = sanitizeMessage(msg.text);
			var recp = msg.to;
			if (message == "")
			{
				debug("bad message from " + user_id);
				return;
			}
			if (clients[recp] == undefined)
			{
				// tell them theyve signed off
				client.send(
					{event: "im", text: "Sorry, user has disconnected.", from: recp}
				);
				return;
			}
			
			// relay the message
			clients[recp].send(
				{event: "im", text: message, from: user_id}
			);
			convo_log += user_id + "," + recp + "," + message + "\r\n";
		}
	}); 
	
	// client disconnect
	client.on('disconnect', function()
	{
		delete clients[user_id];
		RemoveTopic(user_id);
	});
	
	// begin the handshake
	client.send({event: "hi", id: user_id});
	
	sys.puts("New user with " + topics.length + " active users online.");
	
	// write log files for every LOG_FREQUENCY users
	if (uid%LOG_FREQUENCY == 0)
	{
		sys.puts("Writing log files");
		fs.writeFile("searches.txt", topic_log);
		fs.writeFile("messages.txt", convo_log);
	}
}); 
