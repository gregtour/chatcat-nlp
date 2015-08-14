var socket;
var topic;
var results_page	= "";
var u_id 			= -1;
var cur_tab 		= -1;
var stranger_ids 	= [];
var convos			= {};

var names = ["Stranger", "Person", "Buddy", "Friend", "Pal", "Neighbor", "Partner", "Mate", "Compadre", "Amigo", "Tomodachi", "Chum", "Dude", "Anonymous"];
var colors = ["green", "red", "orange", "purple", "gold", "brown", "cyan", "pink"];

// logging
function fail(how)
{
	if (typeof(console) != "undefined" && 
		typeof(console.log) != "undefined")
	{
		console.log("fail: " + how);
	}
	else
	{
		alert("fail: " + how);
	}
}

function change_tab(newTab)
{
	if (newTab == cur_tab && newTab != 0) return;
	if (newTab != 0 && convos[newTab] == undefined)
	{
		fail("switch to invalid tab");
		return;
	}
	
	if (cur_tab != -1)
	{
		var tabName;
		if (cur_tab == 0)
			tabName = "#results";
		else
			tabName = "#tab" + cur_tab;
		
		var tab = $(tabName);
		tab.removeClass('selTab');
		tab.addClass('deselTab');
	}
	
	cur_tab = newTab;
	var tabName;
	if (cur_tab == 0)
		tabName = "#results";
	else
		tabName = "#tab" + cur_tab;
	
	var tab = $(tabName);
	tab.removeClass('deselTab');
	tab.removeClass('newMessages');
	tab.addClass('selTab');
	
	if (cur_tab == 0)
	{
		var chatArea = $("#chatArea");
		chatArea.html(results_page);		
		$("#chatControls").hide();
		$("#repeatbox").keypress(function (e)
		{
			if (e.keyCode != 13) return;
			submit_topic("#repeatbox");
		});		
	}
	else
	{
		var chatArea = $("#chatArea");
		chatArea.html(convos[cur_tab]);
		$("#chatControls").show();
		chatArea.scrollTop(chatArea[0].scrollHeight);
		$("#chatbox").focus();
	}
}

function submit_topic(src)
{
	var text = $(src).attr("value");
	if (text.length == 0 || u_id == -1) return;
	socket.send({
		event: 'topic',
		id: u_id,
		topic: text 
	});
	topic = text;
	var prompt = $("#Prompt");
	if (prompt)
		prompt.fadeOut();
	else
		$(src).fadeOut();
}

function format_im(name, text, color)
{
	text = $('<span>').text(text).html();
	
	var post = '<span class="'+color+'">'+name+'</span>';
	post += ": " + text;
	post += "<br />";
	return post;
}

function send_im()
{
	var msg = $("#chatbox").attr("value");
	if (msg.length == 0 || u_id == -1) return;
	if (cur_tab > 0 && convos[cur_tab] != undefined)
	{
		// send the IM
		socket.send({
			event: 'relay',
			id: u_id,
			text: msg,
			to: cur_tab
		});
		
		// add it to the conversation
		var post = format_im('You', msg, 'blue');
		convos[cur_tab] += post;
		
		// update the current chat
		var chatArea = $("#chatArea");
		chatArea.append(post);
		chatArea.scrollTop(chatArea[0].scrollHeight);
		
		$("#chatbox").attr("value", "");
	}
}

function new_chat(id)
{
	if (convos[id] === undefined)
	{
		// create new conversation with a stranger
		//stranger_ids.push(id);
		var initial = format_im('chatcat', 'Starting a new conversation with someone meow.', 'black');
		convos[id] = initial;
		
		var name = names[id % names.length];
		var color = colors[id % colors.length];

		var newTab = '<span id="tab' + id + '">';
		newTab += name;
		newTab += " <a href='javascript:close_chat("+id+");'>X</a>";
		newTab += '</span>';
		$("#Tabs").append(newTab);
		
		var tab = $("#tab" + id);
		tab.click(function() {change_tab(id)});
		tab.addClass(color);
	}

	change_tab(id);
}

function close_chat(id)
{	
	if (convos[id] != undefined)
	{
		if (cur_tab == id)
			change_tab(0);
		delete convos[id];
		$("#tab" + id).remove();
	}
}

function receive_message(resp)
{
	var event = resp['event'];
	if (event == undefined)
	{
		fail("malformed message");
		return;
	}
	
	// server handshake
	if (event == 'hi')
	{
		if (u_id != -1)
		{
			if (resp['id'] && resp['id'] != u_id)
			{
				fail("client assigned multiple id's");
			}
			return;
		}
		else
		{
			if (resp['id'] == undefined || resp['id'] == -1)
			{
				fail("invalid id assigned");
				return;
			}		
			u_id = resp['id'];
			$("Prompt").fadeIn();
		}
	}
	// display search results
	else if (event == 'results')
	{	
		var results = resp['results'];
		if (results == undefined || typeof results != "object")
		{
			fail("no results returned");
			return;
		}
		
		// create results tab
		if (cur_tab == -1)
		{
			var newTab = '<span id="results">';
			newTab += 'Results';
			newTab += '</span>';
			$("#Tabs").append(newTab);
			
			var tab = $("#results");
			tab.click(function() {change_tab(0)});
			tab.addClass("selTab");
			tab.addClass("blue");
			$("#Tabs").show();			
		}
		
		// produce html for results page
		var topic_fmt = $('<span>').text(topic).html();
		results_page = '<div id="resultsPage">';
		results_page += 'Closest conversations to "';
		results_page += topic_fmt;
		results_page += '":<br /><br /><br />';

		for (var i = 0; i < results.length && i < 10; i++)
		{
			var topic_fmt = $('<span>').text(results[i].topic).html();
			results_page += (i+1) + '. <a href="javascript:new_chat(';
			results_page += results[i].id;
			results_page += ');">';
			results_page += topic_fmt;
			results_page += '</a>';
			results_page += " (" + results[i].score + ")";
			results_page += '<br /><br />';
		}
		
		if (results.length > 0)
		{
			results_page += '<br />';
			results_page += 'Click one of the links above to start a new conversation with a stranger! Otherwise you can sit here and see if someone wants to talk to you.';		
		}
		else
		{
			results_page += "Sorry, your search didn't return any results. Maybe your search was so bland chatcat spat it out, or there's no one else online right now.";
		}
		results_page += "<br /><br /><br />";
		results_page += "anything else you want to talk about?";
		results_page += "<br /><br />";
		results_page += "<input id='repeatbox' size='40' maxlength='66' />";
		results_page += '</div>';
		
		change_tab(0);
	}
	// receive instant messages
	else if (event == 'im')
	{
		if (resp['from'] == undefined || resp['text'] == undefined)
		{
			fail("invalid im received");
			return;
		}
		
		var from = resp['from'];
		var name = names[from % names.length];
		var color = colors[from % colors.length];
		
		if (convos[from] === undefined)
		{
			// a stranger has started a new conversation
			var initial = format_im('chatcat', 'Someone wants to talk to you meow.', 'black');
			convos[from] = initial;
		
			var newTab = '<span id="tab' + from + '">';
			newTab += name;
			newTab += " <a href='javascript:close_chat("+from+");'>X</a>";
			newTab += '</span>';
			$("#Tabs").append(newTab);
			
			var tab = $("#tab" + from);
			tab.click(function() {change_tab(from)});
			tab.addClass("deselTab");
			tab.addClass(color);
		}

		var post = format_im(name, resp['text'], color);
		convos[from] += post;
		
		if (cur_tab == from)
		{
			// new messages to the open window
			var chatArea = $("#chatArea");
			chatArea.append(post);
			chatArea.scrollTop(chatArea[0].scrollHeight);
		}
		else
		{
			// new messages to a hidden tab
			var tab = $("#tab" + from);
			tab.addClass("newMessages");
		}
	}
	else
	{
		fail("invalid event: " + event);
		return;
	}
}
		
function init()
{
	// $("#Prompt").fadeOut();
	$("#topicbox").keypress(function (e)
	{
		if (e.keyCode != 13) return;
		submit_topic("#topicbox");
	});
	
	$("#chatbox").keypress(function (e)
	{
		if (e.keyCode != 13) return;
		if (cur_tab != -1 && cur_tab != 0)
			send_im();
	});
	
	socket = new io.Socket(document.location.hostname, {port: 8080});
	socket.on('disconnect', function(){});
	socket.on('message', receive_message);
	socket.connect();
	
	$("#topicbox").focus();
}

$(document).ready(init);