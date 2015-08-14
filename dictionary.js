/* chatcat dictionary parser
 * converts text files with messages or dictionary entries
 * into json objects the server can load
 * greg tourville
 * may 2011
 */

// NODE LIBRARIES ////////////////////////////////////////////////////////////
var sys 	= require("sys");
var fs 		= require("fs");

MAX_BAG_SIZE = 30;

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
StopWords("when where which while who with would you your one upon");
StopWords("more just was are some up people had yet will were sure");
StopWords("get dont me all them than because really only no over");
StopWords("then time very way well want should make use youre things");
StopWords("youll stuff now without too why didnt know wont has got");
StopWords("even never yes much using first lot since other most still");
StopWords("see same said someone something thing even told took went");
StopWords("year years yourself yeah right wrong might many probably");
StopWords("good best us theyre thought thats theres though everything");

// dictionary
StopWords("adv pl imp pr vb sing pl superl adj obs");
StopWords("being having pertaining act used state any etc called alt");
StopWords("quality manner hence part form small especially under place");
StopWords("body made genus species two another kind certain");
StopWords("usually anything resembling esp ones substance order cause");
StopWords("parts between often power common consisting containing");
StopWords("action applied process sometimes capable such formerly");
StopWords("condition about given found means vessel obtained");

// reddit 
StopWords("what about think going been being did any him back actually");
StopWords("off cant ive pretty after down need always take before work");
StopWords("doesnt guy day around shit better every does two find made am");

var num = 0;
for (var m in STOP_LIST)
	num++;

sys.puts("using " + num + " many stop words");

// WORD RELATION DATA & ALGORITHMS ///////////////////////////////////////////

var word_count = {};
var word_coinc = {};

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
			word_coinc[word] = {};
		}
		else
			word_count[word]++;
		
		// count how often word pairs are bagged together
		for (var k = 0; k < bag.length; k++)
		{
			var pair = bag[k];		
			if (word_coinc[word][pair] === undefined)
				word_coinc[word][pair] = 1;
			else
				word_coinc[word][pair]++;
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
	//data = data.replace(/[\s]+/g, ' ');
	data = data.split("\n");
	
	// create a word bag for each line and add it
	for (var i = 0; i < data.length; i++)
	{
		if (i%1000 == 0)
			sys.puts(" line " + i + " of " + data.length);
		// lower case + remove punctuation & duplicate spaces
		//var line = data[i].toLowerCase();
		//line = line.replace(/[^a-zA-Z\s]+/g, '');
		data[i] = data[i].replace(/[\s]+/g, ' ');
		var words = data[i].split(" ");
	
		// create bag of words for the dictionary entry
		var bag = [];
		var hash = {};
		for (var j = 0; j < words.length && bag.length < MAX_BAG_SIZE; j++)
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
		{
			AssociateWords(bag);
		}
	}
	
	var report = "Successfully loaded dictionary '" + filename;
	report += "' with " + data.length + " lines and ";
	report += numWords + " bagged words.";
	
	delete data;
	
	sys.puts(report);
}

function MergeWords(word, stem)
{
	word_count[stem] += word_count[word];
	delete word_count[word];
	
	for (var p in word_coinc[word])
	{
		var amt = word_coinc[p][word];
		if (word_coinc[p][stem])
		{
			word_coinc[p][stem] += amt;
			word_coinc[stem][p] += amt;
		}
		else
		{
			word_coinc[p][stem] = amt;
			word_coinc[stem][p] = amt;
		}
		
		delete word_coinc[p][word];
	}
	delete word_coinc[word];
	//delete word_count[word];
	//word_count[word] = 0;
}

function MergeStems()
{
	// 15,509 with these
	var stems = ['s', 'es', 'ed', 'd', 'ing', 'ly', 'y', 'er', 'ment'];
	//var stems = ['s']; // 3758 with just s

	var count = 0;
	for (var word in word_count)
	{
		var possible = [word];
		while (possible.length > 0)
		{
			var w = possible.pop();
			for (var k = 0; k < stems.length; k++)
			{
				if (w.length > stems[k].length &&
					w.substr(w.length-stems[k].length) == stems[k])
				{
					var stem = w.substr(0, w.length - stems[k].length);
					if (word_count[stem] != undefined && 
						word_coinc[stem][w])
					{
						//if (word_count[stem] == 0)
//							sys.puts("FAIL");
						MergeWords(word, stem);
						count++;
						k = stems.length;
						possible = [];
					}
					else
						possible.push(stem);
				}
			}
		}
	}

	sys.puts("removed " + count + " words by stemming.");
}

function PruneMatrix(MIN_COUNT)
{
	var squares = 0;
	var rows = 0;
	for (var w in word_count)
	{
		if (word_count[w] == 0)
		{
			delete word_count[w];
		} 
		else if (word_count[w] < MIN_COUNT)
		{
			delete word_count[w];
			for (var p in word_coinc[w])
			{
				if (word_coinc[p])
				delete word_coinc[p][w];
				squares++;
			}
			delete word_coinc[w];
			rows++;
		}
	}
	
	sys.puts("Successfully pruned matrix removing " + rows + " rows and " + squares + " entries.");
}

function HalveMatrix(MIN_SCORE)
{
	var irr = 0;
	for (var j in word_coinc)
	{
		for (var k in word_coinc[j])
		{
			if (j >= k)
			{
				delete word_coinc[j][k];
			}
			else
			{
				var s1 = CompareWords(j,k);
				var s2 = CompareWords(k,j);
				if (s1 < MIN_SCORE && s2 < MIN_SCORE)
				{
					irr++;
					delete word_coinc[j][k];
				}
			}
		}
	}
	sys.puts("matrix halved and " + irr + " irrelevent pairs removed.");
}

function ExportCounts(filename)
{
	fd = fs.openSync(filename, 'w');

	var str = "exports.word_count = {\n";
	var first = true;
	for (var w in word_count)
	{
		if (!first)
			str += ",\n";
		else
			first = false;
		str += w + ": " + word_count[w];
		
		fs.writeSync(fd, str);
		str = "";
	}
	str += "\n};";

	fs.writeSync(fd, str);
	fs.closeSync(fd);
}

function ExportCoinc(filename)
{
	fd = fs.openSync(filename, 'w');

	var str = "exports.word_coinc = {\n";
	var first = true;
	for (var w in word_coinc)
	{
		if (!first)
			str += ",\n";

		str += w + ": {";
		first = true;
		for (var p in word_coinc[w])
		{
			if (!first)
				str += ", ";
			else
				first = false;
			str += p + ": " + word_coinc[w][p];
		}
		str += "}";
		first = false;
		
		fs.writeSync(fd, str);
		str = "";		
	}
	str += "\n};";

	fs.writeSync(fd, str);
	fs.closeSync(fd);
}

function ExportMatrix(filename)
{
	sys.puts("exporting to " + filename + "_coints.txt and " + filename + "_coinc.txt...");
	ExportCounts(filename + "_counts.txt");
	sys.puts("counts exported");
	
	ExportCoinc(filename + "_coinc.txt");
	sys.puts("matrix exported");
}

function PrintWord(word)
{
	var key = "t" + word.toLowerCase();
	var s = "";
	if (word_count[key])
	{
		s = word + ", " + word_count[key] + ": ";
		for (var p in word_coinc[key])
		{
			var pair = p.substr(1);
			s += "[" + pair + ": " + word_coinc[key][p] + "/" + word_count[p] + "], ";
		}
	}
	else
	{
		s = "Sorry '" + word + "' is unlisted.";
	}
	return s;
}

function PrintWords(str)
{
	var s = "";
	var words = str.split(" ");
	for (var i = 0; i < words.length; i++)
	{
		s += PrintWord(words[i]) + "\n\n\n";
	}
	return s;
}

LoadDictionary("dictionary.txt");
//MergeStems();
//PruneMatrix(4);
LoadDictionary("reddit.txt");
MergeStems();
PruneMatrix(5);
HalveMatrix(0.001);
ExportMatrix("reddit");

sys.puts("bye!");
