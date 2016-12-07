git-merge-tokenize
==================

git-merge-tokenize is an experimental git merge driver that performs merges by
splitting files based on arbitrary tokenizers, rather than based on linebreaks.

**This is experimental software. Don't use it for anything important.**

Install
-------

`npm install -g jcushman/git-merge-tokenize`

Configure
---------

In a git repo:

Add new merge drivers to .git/config:

```
echo '[merge "words"]
    name = git-merge-tokenize merge -- word level
    driver = git-merge-tokenize -t words -o %A %O %A %B
    recursive = binary
[merge "chars"]
    name = git-merge-tokenize merge -- character level
    driver = git-merge-tokenize -t chars -o %A %O %A %B
    recursive = binary' >> .git/config
```

Specify which files should use the alternate merge drivers in .git/info/attributes.
For example, this will cause .xml files to use character-by-character merging,
and .txt files to use word-by-word merging:

```
echo '*.xml merge=chars' >> .git/info/attributes
echo '*.txt merge=words' >> .git/info/attributes
```

Use
---

Let's see how this works using a new git repo configured as above:

```
$ echo 'Hello world.' > test.txt
$ git add test.txt
$ git commit -am 'init'
[master (root-commit) 5cec723] init
 1 file changed, 1 insertion(+)
 create mode 100644 test.txt
```

We're now on branch `master` and `test.txt` has contents `Hello world.`

Now let's make a change in a branch:
 
```
$ git checkout -b exclaim
Switched to a new branch 'exclaim'
$ echo 'Hello world!' > test.txt
$ git commit -am 'add exclamation'
[exclaim 3a1fcd4] add exclamation
 1 file changed, 1 insertion(+), 1 deletion(-)
```

On `master`, `text.txt` is `Hello world.`
<br>On `exclaim`, `text.txt` is `Hello world!`

Now let's make a change to the same line on `master`:

```
$ git checkout master
Switched to branch 'master'
$ echo 'Goodbye world.' > test.txt
$ git commit -am 'Hello to goodbye'
[master 605f70d] Hello to goodbye
 1 file changed, 1 insertion(+), 1 deletion(-)
 ```
 
On `master`, `text.txt` is `Goodbye world.`
<br>On `exclaim`, `text.txt` is `Hello world!`
 
If we were using the normal git merge driver, this would be a conflict.
But we can now merge `exclaim` back to develop and get both changes:
 
 ```
$ git merge exclaim -m 'merge exclaim branch into master'
Auto-merging test.txt
Merge made by the 'recursive' strategy.
 test.txt | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ cat test.txt
Goodbye world!
```

The same merge driver also lets us revert earlier changes. Here we'll revert
the earlier hello-to-goodbye change while preserving the exclamation point change:

```
$ git revert HEAD~1
[master 9772b01] Revert "Hello to goodbye"
 1 file changed, 1 insertion(+), 1 deletion(-)
$ cat test.txt
Hello world!
```

Conflicts
---------

Conflicts are reported similarly to the default git merge driver. Let's create a 
conflict where both branches try to add a word in the same place:

```
$ git checkout -b awesome
Switched to a new branch 'awesome'
$ echo 'Hello awesome world!' > test.txt
$ git commit -am "awesome"
[awesome a375a92] awesome
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git checkout master
Switched to branch 'master'
$ echo 'Hello cool world!' > test.txt
$ git commit -am 'cool'
[master 11f1a7c] cool
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git merge awesome
Auto-merging test.txt
CONFLICT (content): Merge conflict in test.txt
Automatic merge failed; fix conflicts and then commit the result.
$ cat test.txt
Hello <<<<<<<
cool
|||||||

=======
awesome
>>>>>>>world!
```
